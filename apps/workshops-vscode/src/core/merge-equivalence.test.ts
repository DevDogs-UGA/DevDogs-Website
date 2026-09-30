import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { acceptAll } from "./merge.js";
import { loadFileMerge, planReview } from "./plan.js";
import { readStepLine, type Step } from "./tags.js";
import { sh } from "./test-repo.js";

/**
 * "Accept everything" must equal `git merge`, for every step range of both
 * workshop repos. Each range is replayed in a temp clone (never the source
 * repo) three ways: with their working tree exactly at the base, and with a
 * local edit at the end / start of every file the range modifies. A variant
 * whose `git merge` conflicts has no git answer to compare and is skipped;
 * the pristine one can never conflict.
 *
 * Sources default to the slides app's workshop submodules; override with
 * WORKSHOPS_WEB_REPO / WORKSHOPS_MOBILE_REPO. Skips when a repo, its steps
 * or its start branch are absent. Repos still carrying the old `demo/NN-slug`
 * tags are mapped to `02-supabase/NN-slug`, and `02-supabase/00-start` is
 * created at the workshop's first-workshop branch, as the real tags will be.
 */

const here = dirname(fileURLToPath(import.meta.url));
const submodule = (name: string) =>
  join(here, "../../../slides/workshops", name);

const REPOS = [
  {
    name: "web",
    path: process.env["WORKSHOPS_WEB_REPO"] ?? submodule("web"),
    start: /^01-nextjs-intro$/,
  },
  {
    name: "mobile",
    path: process.env["WORKSHOPS_MOBILE_REPO"] ?? submodule("mobile"),
    start: /^01-flutter-intro$/,
  },
];
const WORKSHOP = "02-supabase";

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Clones just refs (not the work tree) into a temp repo and normalises tags. */
function prepare(source: string, start: RegExp): string | null {
  if (!existsSync(join(source, ".git"))) return null;
  const dir = mkdtempSync(join(tmpdir(), "workshops-equiv-"));
  tmpDirs.push(dir);
  try {
    sh(dir, "init", "-q");
    sh(
      dir,
      "fetch",
      "-q",
      source,
      "+refs/tags/*:refs/tags/*",
      "+refs/remotes/origin/*:refs/remotes/origin/*",
      "+refs/heads/*:refs/remotes/local/*",
    );
    const tags = sh(
      dir,
      "for-each-ref",
      "--format=%(refname:lstrip=2)",
      "refs/tags/",
    )
      .split("\n")
      .filter(Boolean);
    for (const tag of tags) {
      const legacy = /^demo\/(\d\d-.+)$/.exec(tag);
      if (legacy && !tags.includes(`${WORKSHOP}/${legacy[1]}`)) {
        sh(dir, "tag", `${WORKSHOP}/${legacy[1]}`, `refs/tags/${tag}^{commit}`);
      }
    }
    // The first workshop's branch, wherever the source keeps it.
    const branches = sh(
      dir,
      "for-each-ref",
      "--format=%(refname)",
      "refs/remotes/",
    )
      .split("\n")
      .filter(Boolean);
    const startBranch = branches.find((ref) =>
      start.test(ref.replace(/^refs\/remotes\/(origin|local)\//, "")),
    );
    const hasSteps =
      sh(
        dir,
        "for-each-ref",
        "--format=%(refname)",
        `refs/tags/${WORKSHOP}/`,
      ).trim() !== "";
    if (!hasSteps) return null;
    if (!tags.includes(`${WORKSHOP}/00-start`)) {
      if (!startBranch) return null;
      sh(dir, "tag", `${WORKSHOP}/00-start`, `${startBranch}^{commit}`);
    }
    return dir;
  } catch (error) {
    console.warn(`skipping ${source}: ${String(error).slice(0, 300)}`);
    return null;
  }
}

/** path -> blob id for the index, ignoring modes. */
function indexMap(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of sh(dir, "ls-files", "-s", "-z").split("\0")) {
    const match = /^\d+ ([0-9a-f]+) \d\t(.*)$/s.exec(line);
    if (match) map.set(match[2]!, match[1]!);
  }
  return map;
}

function reset(dir: string, commit: string): void {
  sh(dir, "switch", "-q", "-f", "--detach", commit);
  sh(dir, "clean", "-fdxq");
}

type Variant = "pristine" | "append" | "prepend";

interface Tally {
  compared: number;
  conflicted: number;
}

async function checkRange(
  dir: string,
  line: Step[],
  base: Step,
  target: Step,
  tally: Record<Variant, Tally>,
) {
  const plan = await planReview(dir, line, base, target);

  for (const variant of ["pristine", "append", "prepend"] as const) {
    // Their branch: the base tag's commit plus, for the edit variants, one
    // local commit touching every text file the range modifies.
    reset(dir, `refs/tags/${base.tag}`);
    if (variant !== "pristine") {
      let edited = 0;
      for (const file of plan.files) {
        if (file.status !== "modified" && file.status !== "renamed") continue;
        const path = join(dir, file.oldPath ?? file.path);
        if (!existsSync(path)) continue;
        const text = readFileSync(path, "utf8");
        writeFileSync(
          path,
          variant === "append"
            ? `${text}\n// local edit\n`
            : `// local edit\n${text}`,
        );
        edited++;
      }
      writeFileSync(join(dir, "LOCAL-NOTES.md"), "my notes\n");
      if (edited === 0 && variant === "prepend") continue; // same as the append variant
      sh(dir, "add", "-A");
      sh(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "local work");
    }
    const ours = sh(dir, "rev-parse", "HEAD").trim();

    // git's answer.
    let expected: Map<string, string>;
    try {
      sh(
        dir,
        "merge",
        "-q",
        "--no-ff",
        "--no-edit",
        "--end-of-options",
        `refs/tags/${target.tag}`,
      );
      expected = indexMap(dir);
    } catch {
      sh(dir, "merge", "--abort");
      tally[variant].conflicted++;
      continue;
    }

    // Our answer: accept everything, applied to the same working tree.
    reset(dir, ours);
    for (const file of plan.files) {
      const merge = await loadFileMerge(dir, plan, file);
      if (merge === null) throw new Error(`${file.path} unexpectedly binary`);
      const result = acceptAll(merge);
      if (file.oldPath && file.oldPath !== file.path)
        rmSync(join(dir, file.oldPath), { force: true });
      if (result.exists) {
        mkdirSync(dirname(join(dir, file.path)), { recursive: true });
        writeFileSync(join(dir, file.path), result.text);
      } else rmSync(join(dir, file.path), { force: true });
    }
    for (const file of plan.fromTarget) {
      if (file.oldPath && file.oldPath !== file.path)
        rmSync(join(dir, file.oldPath), { force: true });
      if (file.status === "deleted")
        rmSync(join(dir, file.path), { force: true });
      else {
        const blob = sh(
          dir,
          "rev-parse",
          `refs/tags/${target.tag}:${file.path}`,
        ).trim();
        mkdirSync(dirname(join(dir, file.path)), { recursive: true });
        writeFileSync(join(dir, file.path), sh(dir, "cat-file", "blob", blob));
      }
    }
    // -f: a step may add a file the repo's .gitignore covers (.env.example).
    sh(dir, "add", "-A", "-f");
    const actual = indexMap(dir);

    const differing = [
      ...new Set([...expected.keys(), ...actual.keys()]),
    ].filter((p) => expected.get(p) !== actual.get(p));
    expect(differing, `${variant}: ${base.tag} -> ${target.tag}`).toEqual([]);
    tally[variant].compared++;
  }
}

for (const repo of REPOS) {
  const dir = prepare(repo.path, repo.start);
  describe.skipIf(dir === null)(
    `accept-all equals git merge: ${repo.name}`,
    () => {
      it("covers every base < target pair", async () => {
        const line = await readStepLine(dir!, WORKSHOP);
        expect(line.length).toBeGreaterThan(2);
        const tally: Record<Variant, Tally> = {
          pristine: { compared: 0, conflicted: 0 },
          append: { compared: 0, conflicted: 0 },
          prepend: { compared: 0, conflicted: 0 },
        };
        let pairs = 0;
        for (let b = 0; b < line.length; b++) {
          for (let t = b + 1; t < line.length; t++) {
            await checkRange(dir!, line, line[b]!, line[t]!, tally);
            pairs++;
          }
        }
        console.info(`${repo.name}: ${pairs} ranges`, JSON.stringify(tally));
        expect(pairs).toBe((line.length * (line.length - 1)) / 2);
        // Their tree at the base can't conflict, so every pair was compared.
        expect(tally.pristine).toEqual({ compared: pairs, conflicted: 0 });
      });
    },
  );
}
