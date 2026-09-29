import { afterEach, describe, expect, it } from "vitest";
import { TestRepo } from "../core/test-repo.js";
import { cloneRootIfMatches, loadSnapshot, remoteUrls, repoRoot } from "./repo.js";

let repo: TestRepo | undefined;
afterEach(() => repo?.dispose());

function build(): TestRepo {
  const r = TestRepo.init();
  r.commit({ "a.txt": "0\n" });
  r.tag("01-a/00-start", "Start: ");
  r.commit({ "a.txt": "1\n" });
  r.tag("01-a/01-one", "One");
  r.tag("02-b/00-start", "Start: 01-a");
  r.commit({ "a.txt": "2\n" });
  r.tag("02-b/01-two", "Two");
  return r;
}

describe("remote lookups", () => {
  it("finds the top level and any matching remote", async () => {
    repo = build();
    repo.git("remote", "add", "upstream", "git@github.com:someone/else.git");
    repo.git("remote", "add", "origin", "https://github.com/devdogsuga/web-workshops.git");
    expect(await remoteUrls(repo.dir)).toHaveLength(2);
    const real = repo.git("rev-parse", "--show-toplevel").trim();
    expect(await repoRoot(repo.dir)).toBe(real);
    expect(await cloneRootIfMatches(repo.dir, "DevDogsUGA/Web-Workshops")).toBe(real);
    expect(await cloneRootIfMatches(repo.dir, "DevDogsUGA/Mobile-Workshops")).toBeNull();
  });

  it("copes with no remotes and with a folder that isn't a repo", async () => {
    repo = build();
    expect(await remoteUrls(repo.dir)).toEqual([]);
    expect(await cloneRootIfMatches("/", "DevDogsUGA/Web-Workshops")).toBeNull();
  });
});

describe("loadSnapshot", () => {
  it("reads the line across workshops and the current step", async () => {
    repo = build();
    const snap = await loadSnapshot(repo.dir);
    expect(snap.workshops).toEqual(["01-a", "02-b"]);
    expect(snap.workshop).toBe("02-b");
    expect(snap.line.map((s) => s.tag)).toEqual([
      "01-a/00-start",
      "01-a/01-one",
      "02-b/00-start",
      "02-b/01-two",
    ]);
    expect(snap.current?.tag).toBe("02-b/01-two");
    expect(snap.branch).toBe("main");
  });

  it("is empty for a repo without step tags", async () => {
    repo = TestRepo.init();
    repo.commit({ "a.txt": "x\n" });
    expect(await loadSnapshot(repo.dir)).toMatchObject({ workshop: undefined, line: [], current: null });
  });
});
