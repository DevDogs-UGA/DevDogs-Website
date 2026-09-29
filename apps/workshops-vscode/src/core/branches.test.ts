import { afterEach, describe, expect, it } from "vitest";
import {
  applyBranchPlan,
  currentBranch,
  isValidUsername,
  isWorkshopBranch,
  jumpToStep,
  latestWorkshop,
  localBranches,
  personalBranchName,
  planPersonalBranch,
  workshopOfBranch,
} from "./branches.js";
import { TestRepo } from "./test-repo.js";

let repo: TestRepo | undefined;
afterEach(() => repo?.dispose());

const workshops = ["01-nextjs-intro", "02-supabase"];

describe("isWorkshopBranch", () => {
  it.each([
    ["main", true],
    ["master", true],
    ["02-supabase", true],
    ["01-nextjs-intro", true],
    ["03-brand-new", true],
    [null, true],
    ["sloan/02-supabase", false],
    ["my-feature", false],
    ["2-supabase", false],
  ])("%s -> %s", (branch, expected) => {
    expect(isWorkshopBranch(branch, workshops)).toBe(expected);
  });

  it("knows a workshop by its tags even when the name is unusual", () => {
    expect(isWorkshopBranch("bonus", ["bonus"])).toBe(true);
  });
});

describe("workshopOfBranch / latestWorkshop / usernames", () => {
  it("reads the workshop off a personal or a workshop branch", () => {
    expect(workshopOfBranch("sloan/02-supabase", workshops)).toBe("02-supabase");
    expect(workshopOfBranch("01-nextjs-intro", workshops)).toBe("01-nextjs-intro");
    expect(workshopOfBranch("main", workshops)).toBeUndefined();
    expect(workshopOfBranch(null, workshops)).toBeUndefined();
  });

  it("picks the highest-numbered workshop", () => {
    expect(latestWorkshop(["02-supabase", "01-nextjs-intro"])).toBe("02-supabase");
    expect(latestWorkshop([])).toBeUndefined();
    // Legacy `demo/*` tags sort after the numbered names but are not a workshop line.
    expect(latestWorkshop(["02-supabase", "demo"])).toBe("02-supabase");
    expect(latestWorkshop(["bonus"])).toBe("bonus");
  });

  it("accepts GitHub logins and refuses anything git could misread", () => {
    for (const ok of ["sloanfinger", "a", "a-b-c", "User123"]) expect(isValidUsername(ok)).toBe(true);
    for (const bad of ["", "-x", "x-", "a--b", "a/b", "a b", "--upload-pack=x", "x".repeat(40)]) {
      expect(isValidUsername(bad)).toBe(false);
    }
    expect(() => personalBranchName("-x", "02-supabase")).toThrow();
    expect(() => personalBranchName("sloan", "../evil")).toThrow();
  });
});

describe("planPersonalBranch", () => {
  const base = {
    user: "sloan",
    workshop: "02-supabase",
    workshops,
    previousWorkshop: "01-nextjs-intro" as string | undefined,
  };

  it("stays on a branch of their own", () => {
    expect(
      planPersonalBranch({ ...base, currentBranch: "my-feature", localBranches: ["my-feature"] }),
    ).toEqual({ kind: "stay", branch: "my-feature" });
    expect(
      planPersonalBranch({
        ...base,
        currentBranch: "sloan/02-supabase",
        localBranches: ["sloan/02-supabase"],
      }),
    ).toEqual({ kind: "stay", branch: "sloan/02-supabase" });
  });

  it("switches to the personal branch when it already exists", () => {
    expect(
      planPersonalBranch({
        ...base,
        currentBranch: "02-supabase",
        localBranches: ["02-supabase", "sloan/02-supabase"],
      }),
    ).toEqual({ kind: "switch", branch: "sloan/02-supabase" });
  });

  it("starts from their previous workshop's branch when they have one", () => {
    expect(
      planPersonalBranch({
        ...base,
        currentBranch: null,
        localBranches: ["main", "sloan/01-nextjs-intro"],
      }),
    ).toEqual({
      kind: "create",
      branch: "sloan/02-supabase",
      start: {
        kind: "branch",
        name: "sloan/01-nextjs-intro",
        ref: "refs/heads/sloan/01-nextjs-intro",
      },
    });
  });

  it("falls back to the workshop's 00-start tag", () => {
    for (const previousWorkshop of ["01-nextjs-intro", undefined]) {
      expect(
        planPersonalBranch({ ...base, previousWorkshop, currentBranch: "main", localBranches: ["main"] }),
      ).toEqual({
        kind: "create",
        branch: "sloan/02-supabase",
        start: { kind: "tag", name: "02-supabase/00-start", ref: "refs/tags/02-supabase/00-start" },
      });
    }
  });
});

describe("applyBranchPlan and jumpToStep", () => {
  function build(): TestRepo {
    const r = TestRepo.init();
    r.commit({ "a.txt": "start\n", "b.txt": "b\n" });
    r.tag("w/00-start", "Start: ");
    r.commit({ "a.txt": "start\nstep one\n" });
    r.tag("w/01-one", "One");
    r.git("branch", "-m", "w");
    return r;
  }

  it("creates the branch at the tag and carries uncommitted work", async () => {
    repo = build();
    repo.git("switch", "-q", "--detach", "refs/tags/w/00-start");
    repo.write("b.txt", "my edit\n");
    repo.write("new.txt", "untracked\n");
    expect(await currentBranch(repo.dir)).toBeNull();

    await applyBranchPlan(repo.dir, {
      kind: "create",
      branch: "sloan/w",
      start: { kind: "tag", name: "w/00-start", ref: "refs/tags/w/00-start" },
    });
    expect(await currentBranch(repo.dir)).toBe("sloan/w");
    expect(await localBranches(repo.dir)).toContain("sloan/w");
    expect(repo.git("status", "--porcelain")).toContain(" M b.txt");
    expect(repo.git("status", "--porcelain")).toContain("?? new.txt");
  });

  it("switches to an existing branch, keeping the edit", async () => {
    repo = build();
    repo.git("branch", "sloan/w", "refs/tags/w/00-start");
    repo.write("b.txt", "my edit\n");
    await applyBranchPlan(repo.dir, { kind: "switch", branch: "sloan/w" });
    expect(await currentBranch(repo.dir)).toBe("sloan/w");
    expect(repo.git("status", "--porcelain")).toContain(" M b.txt");
  });

  it("jumps to a step, discarding tracked changes", async () => {
    repo = build();
    repo.write("a.txt", "scribbles\n");
    const branch = await jumpToStep(repo.dir, "sloan", "w/01-one");
    expect(branch).toBe("sloan/w");
    expect(await currentBranch(repo.dir)).toBe("sloan/w");
    expect(repo.git("status", "--porcelain")).toBe("");
    expect(repo.git("rev-parse", "HEAD").trim()).toBe(repo.git("rev-parse", "refs/tags/w/01-one^{commit}").trim());
  });

  it("refuses a tag that is not a step", async () => {
    repo = build();
    await expect(jumpToStep(repo.dir, "sloan", "v1.0")).rejects.toThrow(/Not a step tag/);
  });
});
