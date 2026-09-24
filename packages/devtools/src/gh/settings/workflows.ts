/**
 * Every `uses:` a repository's own `.github/workflows/*.y*ml` files name,
 * and whether each one is pinned to a 40-hex commit SHA.
 *
 * TASK-342's `sha_pinning_required` plan item must never propose turning
 * that Actions setting on while the repository's OWN workflows would
 * immediately fail under it — GitHub refuses an unpinned `uses:` the moment
 * the setting is live. This module is the check that runs BEFORE `desired.ts`
 * builds a plan, using the same repo-root discovery contract every other
 * devtools module reads a target repo through (`findRepoRoot()`, see
 * `../../repo/root.ts`'s header).
 *
 * A local action (`uses: ./.github/actions/…`) or a same-repo reusable
 * workflow (`uses: ./.github/workflows/…`) has no marketplace ref to pin —
 * there is no `@<sha>` for a path — so both are treated as pinned by
 * definition and excluded from `computeActionPatterns()`'s allow-list: they
 * are not "an action" in the sense `allowed_actions: selected` or SHA
 * pinning ever governs.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "../../repo/root.js";

const FULL_SHA = /^[0-9a-f]{40}$/;

/** An `owner/repo@ref`-shaped `uses:`; `null` for a local path this reconciler does not govern. */
export interface ActionRef {
  owner: string;
  repo: string;
  version: string;
}

export interface ActionUse {
  /** The `uses:` value verbatim, trailing comment and quoting stripped. */
  raw: string;
  ref: ActionRef | null;
  file: string;
  line: number;
}

/** The directory `uses:` lines are scanned from — `.github/workflows` at the repo root. */
export function workflowsDir(repoRoot: string = findRepoRoot()): string {
  return join(repoRoot, ".github", "workflows");
}

/** Every `*.yml`/`*.yaml` file directly inside `.github/workflows`, sorted for stable output. Empty, not throwing, when the directory does not exist. */
export function listWorkflowFiles(repoRoot: string = findRepoRoot()): string[] {
  const dir = workflowsDir(repoRoot);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => join(dir, name))
    .sort();
}

const USES_LINE = /^\s*(?:-\s*)?uses:\s*(.+?)\s*$/;

/**
 * Parses every `uses:` line out of one workflow file's text.
 *
 * A plain line scan, not a YAML parser: workflow files are trusted repo
 * content, `uses:` is always a scalar on its own line in every workflow
 * DevDogsUGA has ever written (job-level and step-level alike), and pulling
 * in a YAML dependency to read one field would be a worse trade than a
 * regex that `workflows.test.ts` pins against the repo's real files.
 */
export function parseUsesLines(file: string, contents: string): ActionUse[] {
  const out: ActionUse[] = [];
  const lines = contents.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = USES_LINE.exec(lines[i]!);
    if (!match) continue;

    let value = match[1]!;
    const hash = value.indexOf("#");
    if (hash !== -1) value = value.slice(0, hash).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (value === "") continue;

    if (value.startsWith(".") || value.startsWith("docker://")) {
      out.push({ raw: value, ref: null, file, line: i + 1 });
      continue;
    }

    const at = value.lastIndexOf("@");
    const spec = at === -1 ? value : value.slice(0, at);
    const version = at === -1 ? "" : value.slice(at + 1);
    const slash = spec.indexOf("/");

    if (at === -1 || slash === -1) {
      // No `@ref`, or no `owner/repo` shape — not a marketplace action this
      // reconciler can classify; recorded with `ref: null` so it is neither
      // flagged as unpinned nor added to the allow-list, and is still
      // visible in a raw dump if one is ever needed.
      out.push({ raw: value, ref: null, file, line: i + 1 });
      continue;
    }

    out.push({
      raw: value,
      ref: { owner: spec.slice(0, slash), repo: spec.slice(slash + 1), version },
      file,
      line: i + 1,
    });
  }
  return out;
}

/** Every `uses:` across every workflow file in the repo. */
export function collectActionUses(repoRoot: string = findRepoRoot()): ActionUse[] {
  const uses: ActionUse[] = [];
  for (const file of listWorkflowFiles(repoRoot)) {
    const contents = readFileSync(file, "utf8");
    uses.push(...parseUsesLines(file, contents));
  }
  return uses;
}

/** `owner/repo@ref` uses only — local paths carry no ref to check or allow-list. */
export function externalActionUses(uses: readonly ActionUse[]): ActionUse[] {
  return uses.filter((u) => u.ref !== null);
}

export function isShaPinned(use: ActionUse): boolean {
  return use.ref === null || FULL_SHA.test(use.ref.version);
}

/** Every external `uses:` NOT pinned to a 40-hex SHA — the refusal list for `sha_pinning_required`. */
export function unpinnedActionUses(uses: readonly ActionUse[]): ActionUse[] {
  return externalActionUses(uses).filter((u) => !isShaPinned(u));
}

/**
 * `owner/repo@*` for every distinct external action the workflows use,
 * sorted and deduplicated — the `patterns_allowed` list for `allowed_actions:
 * selected`, computed from what the workflows actually reference rather than
 * hand-maintained.
 */
export function computeActionPatterns(uses: readonly ActionUse[]): string[] {
  const patterns = new Set<string>();
  for (const use of externalActionUses(uses)) {
    patterns.add(`${use.ref!.owner}/${use.ref!.repo}@*`);
  }
  return [...patterns].sort();
}
