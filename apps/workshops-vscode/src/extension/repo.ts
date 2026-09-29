import { join } from "node:path";
import {
  currentBranch,
  findCurrentStep,
  git,
  gitRaw,
  latestWorkshop,
  listWorkshops,
  readStepLine,
  type Step,
} from "../core/index.js";
import { remotesMatchRepo } from "./remote.js";

/**
 * Git-backed facts about one clone that the shell needs, kept free of vscode
 * so they are tested against real throwaway repos like the core is.
 */

/** Network calls must never wait on a credential prompt nobody can see. */
const NETWORK = { env: { GIT_TERMINAL_PROMPT: "0" }, timeoutMs: 60_000 } as const;

/** The repo's top-level directory for any folder inside it, or null. */
export async function repoRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await gitRaw(dir, ["rev-parse", "--show-toplevel"]);
    return stdout.toString("utf8").trim() || null;
  } catch {
    return null;
  }
}

/** Every remote URL of the clone at `root`. */
export async function remoteUrls(root: string): Promise<string[]> {
  const { stdout } = await gitRaw(root, ["config", "--get-regexp", "^remote\\..*\\.url$"], [1]);
  return stdout
    .toString("utf8")
    .split("\n")
    .map((line) => line.replace(/^\S+\s+/, "").trim())
    .filter(Boolean);
}

/** Whether the clone at `dir` has a remote naming `repo`; returns its top level when so. */
export async function cloneRootIfMatches(dir: string, repo: string): Promise<string | null> {
  const root = await repoRoot(dir);
  if (root === null) return null;
  return remotesMatchRepo(await remoteUrls(root), repo) ? root : null;
}

/** The one thing a link may run without asking: `git fetch origin --tags`. */
export async function fetchTags(root: string): Promise<void> {
  await git(root, ["fetch", "origin", "--tags"], NETWORK);
}

/** `git clone -- https://github.com/<repo> <parent>/<name>`; returns the new clone's path. */
export async function cloneRepo(repo: string, parent: string): Promise<string> {
  const name = repo.slice(repo.indexOf("/") + 1);
  await git(parent, ["clone", "--", `https://github.com/${repo}`, name], {
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 10 * 60_000,
  });
  return join(parent, name);
}

export interface Snapshot {
  workshops: string[];
  /** The newest workshop: the line ends here. */
  workshop: string | undefined;
  /** Every step across workshops, oldest first, `00-start` markers included. */
  line: Step[];
  /** Newest step already in HEAD's history. */
  current: Step | null;
  /** null when HEAD is detached. */
  branch: string | null;
}

/** Reads the panel's whole picture of a clone in a handful of git calls. */
export async function loadSnapshot(root: string): Promise<Snapshot> {
  const workshops = await listWorkshops(root);
  const workshop = latestWorkshop(workshops);
  const line = workshop ? await readStepLine(root, workshop) : [];
  const [current, branch] = await Promise.all([
    line.length > 0 ? findCurrentStep(root, line) : Promise.resolve(null),
    currentBranch(root),
  ]);
  return { workshops, workshop, line, current, branch };
}
