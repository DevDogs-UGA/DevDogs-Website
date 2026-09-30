import { afterEach, describe, expect, it } from "vitest";
import { acceptAll } from "./merge.js";
import { isLockfile, loadFileMerge, planReview } from "./plan.js";
import { readStepLine } from "./tags.js";
import { TestRepo } from "./test-repo.js";

let repo: TestRepo | undefined;
afterEach(() => repo?.dispose());

const BODY =
  Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n") + "\n";

function build(): TestRepo {
  const r = TestRepo.init();
  r.commit({
    "src/keep.ts": BODY,
    "src/old-name.ts": BODY + "old\n",
    "gone.txt": "bye\n",
    "pnpm-lock.yaml": "v1\n",
    "logo.png": Buffer.from([0, 1, 2, 3]),
  });
  r.tag("02-x/00-start", "Start: 01-intro");
  r.commit({
    "src/keep.ts": BODY.replace("line 3", "LINE 3"),
    "pnpm-lock.yaml": "v2\n",
  });
  r.tag("02-x/01-a", "A\n\nRun: pnpm add a\nDocs: /docs/a");
  r.git("mv", "src/old-name.ts", "src/new-name.ts");
  r.commit({
    "gone.txt": null,
    "src/added.ts": "new\n",
    "logo.png": Buffer.from([0, 9, 9]),
  });
  r.tag("02-x/02-b", "B\n\nRun: pnpm add b\nRun: pnpm add c");
  r.tag("03-y/00-start", "Start: 02-x");
  r.commit({ "src/added.ts": "new\nmore\n" });
  r.tag("03-y/01-c", "C\n\nRun: pnpm dlx d");
  return r;
}

describe("planReview", () => {
  it("covers renames and deletes and splits off lockfiles and binaries", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "02-x");
    const plan = await planReview(repo.dir, line, line[0]!, line[2]!);
    const byPath = Object.fromEntries(plan.files.map((f) => [f.path, f]));
    expect(byPath["src/keep.ts"]).toMatchObject({ status: "modified" });
    expect(byPath["gone.txt"]).toMatchObject({ status: "deleted" });
    expect(byPath["src/added.ts"]).toMatchObject({ status: "added" });
    expect(byPath["src/new-name.ts"]).toMatchObject({
      status: "renamed",
      oldPath: "src/old-name.ts",
    });
    expect(plan.fromTarget.map((f) => [f.path, f.reason]).sort()).toEqual([
      ["logo.png", "binary"],
      ["pnpm-lock.yaml", "lockfile"],
    ]);
  });

  it("collects Run commands of every step in the range, in order", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "02-x");
    expect(
      (await planReview(repo.dir, line, line[0]!, line[2]!)).commands,
    ).toEqual(["pnpm add a", "pnpm add b", "pnpm add c"]);
    const single = await planReview(repo.dir, line, line[1]!, line[2]!);
    expect(single.steps.map((s) => s.tag)).toEqual(["02-x/02-b"]);
    expect(single.commands).toEqual(["pnpm add b", "pnpm add c"]);
  });

  it("plans a range across a workshop boundary", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "03-y");
    const plan = await planReview(repo.dir, line, line[1]!, line[4]!);
    expect(plan.steps.map((s) => s.tag)).toEqual([
      "02-x/02-b",
      "03-y/00-start",
      "03-y/01-c",
    ]);
    expect(plan.commands).toEqual(["pnpm add b", "pnpm add c", "pnpm dlx d"]);
    expect(plan.files.map((f) => f.path)).toContain("src/added.ts");
  });

  it("rejects a range that isn't forward", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "02-x");
    await expect(
      planReview(repo.dir, line, line[2]!, line[1]!),
    ).rejects.toThrow(/not before/);
    await expect(
      planReview(repo.dir, line, line[1]!, line[1]!),
    ).rejects.toThrow(/not before/);
  });
});

describe("loadFileMerge", () => {
  it("merges the working file with the step", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "02-x");
    const plan = await planReview(repo.dir, line, line[0]!, line[2]!);
    repo.git("switch", "-q", "--detach", "02-x/00-start");
    repo.write("src/keep.ts", "// mine\n" + BODY);

    const keep = plan.files.find((f) => f.path === "src/keep.ts")!;
    const merge = await loadFileMerge(repo.dir, plan, keep);
    expect(merge?.changes).toHaveLength(1);
    expect(acceptAll(merge!).text).toBe(
      "// mine\n" + BODY.replace("line 3", "LINE 3"),
    );

    const renamed = plan.files.find((f) => f.status === "renamed")!;
    const rn = await loadFileMerge(repo.dir, plan, renamed);
    expect(rn?.changes).toEqual([]); // content is identical; only the name moves
    expect(acceptAll(rn!).text).toBe(BODY + "old\n");
  });

  it("returns null when a side is binary", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "02-x");
    const plan = await planReview(repo.dir, line, line[0]!, line[2]!);
    const png = {
      path: "logo.png",
      oldPath: undefined,
      status: "modified" as const,
    };
    expect(await loadFileMerge(repo.dir, plan, png)).toBeNull();
  });
});

describe("isLockfile", () => {
  it("matches by basename at any depth", () => {
    expect(isLockfile("pnpm-lock.yaml")).toBe(true);
    expect(isLockfile("app/pubspec.lock")).toBe(true);
    expect(isLockfile("package-lock.json")).toBe(true);
    expect(isLockfile("yarn.lock")).toBe(true);
    expect(isLockfile("src/lock.ts")).toBe(false);
  });
});
