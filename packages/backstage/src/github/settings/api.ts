/**
 * `gh api` calls this reconciler needs, over the repository-settings
 * endpoints TASK-342 governs: security-and-analysis, Dependabot, Actions
 * permissions, and environment deployment-branch policies.
 *
 * `gh`, not Octokit — same reasoning as `../rulesets/api.ts`'s header, which
 * this module otherwise mirrors closely (its own `run`/`writeJson` rather
 * than a shared import, matching `../environments.ts` and `../rulesets/
 * api.ts` each carrying their own — this package's established way of
 * keeping one `gh` wrapper's blast radius from the next).
 *
 * Reads are always allowed. Writes need `admin` on the repository, exactly
 * as they do today from the Settings UI, and `commands.ts` is the only
 * caller that reaches them, gated behind `--apply`.
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type {
  LiveActionsPermissions,
  LiveAutomatedSecurityFixes,
  LiveBranchPolicy,
  LiveDeploymentBranchPolicy,
  LiveEnvironment,
  LiveRepo,
  LiveSecurityAndAnalysis,
  LiveSelectedActions,
  LiveWorkflowPermissions,
} from "./types.js";

const run = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

export class GhSettingsError extends Error {}

function describe(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  const stderr = (e.stderr ?? "").trim();
  const message = e.message ?? "";
  return stderr || message || "gh failed with no output.";
}

/** `owner/repo`, e.g. `DevDogsUGA/DevDogsUGA`. */
export interface Repo {
  owner: string;
  repo: string;
}

function repoPath(r: Repo, suffix = ""): string {
  return `repos/${r.owner}/${r.repo}${suffix}`;
}

async function readJson<T>(apiPath: string): Promise<T> {
  try {
    const { stdout } = await run("gh", ["api", apiPath], {
      maxBuffer: MAX_BUFFER,
      shell: false,
    });
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new GhSettingsError(describe(err));
  }
}

/**
 * Runs `gh api <path> -X <method>`, writing `body` on stdin (JSON) when
 * given, and returning the parsed JSON response (or `{}` for a body-less
 * response). See `../rulesets/api.ts`'s `writeJson` for why stdin, not `-f`
 * field flags or a temp file.
 */
async function writeJson(
  method: "PUT" | "PATCH" | "POST" | "DELETE",
  apiPath: string,
  body?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args =
      body === undefined
        ? ["api", apiPath, "-X", method]
        : ["api", apiPath, "-X", method, "--input", "-"];
    const child = spawn("gh", args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => reject(new GhSettingsError(describe(err))));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new GhSettingsError(describe({ stderr })));
        return;
      }
      const trimmed = stdout.trim();
      resolve(trimmed === "" ? {} : JSON.parse(trimmed));
    });

    if (body === undefined) child.stdin.end();
    else child.stdin.end(JSON.stringify(body));
  });
}

// ── repository / security-and-analysis ──────────────────────────────────────

export async function getRepo(r: Repo): Promise<LiveRepo> {
  return readJson<LiveRepo>(repoPath(r));
}

export async function patchSecurityAndAnalysis(
  r: Repo,
  fields: Partial<LiveSecurityAndAnalysis>,
): Promise<void> {
  await writeJson("PATCH", repoPath(r), { security_and_analysis: fields });
}

// ── Dependabot ───────────────────────────────────────────────────────────────

/**
 * `GET /repos/{owner}/{repo}/vulnerability-alerts` returns 204 with an
 * empty body when Dependabot alerts are on, and 404 when they are off — the
 * one endpoint in this file with no JSON to parse either way.
 */
export async function getVulnerabilityAlertsEnabled(r: Repo): Promise<boolean> {
  try {
    await run("gh", ["api", repoPath(r, "/vulnerability-alerts")], {
      maxBuffer: MAX_BUFFER,
      shell: false,
    });
    return true;
  } catch (err) {
    if (/\b404\b/.test(describe(err))) return false;
    throw new GhSettingsError(describe(err));
  }
}

export async function setVulnerabilityAlertsEnabled(
  r: Repo,
  enabled: boolean,
): Promise<void> {
  await writeJson(
    enabled ? "PUT" : "DELETE",
    repoPath(r, "/vulnerability-alerts"),
  );
}

export async function getAutomatedSecurityFixes(
  r: Repo,
): Promise<LiveAutomatedSecurityFixes> {
  return readJson<LiveAutomatedSecurityFixes>(
    repoPath(r, "/automated-security-fixes"),
  );
}

export async function setAutomatedSecurityFixesEnabled(
  r: Repo,
  enabled: boolean,
): Promise<void> {
  await writeJson(
    enabled ? "PUT" : "DELETE",
    repoPath(r, "/automated-security-fixes"),
  );
}

// ── Actions permissions ──────────────────────────────────────────────────────

export async function getActionsPermissions(
  r: Repo,
): Promise<LiveActionsPermissions> {
  return readJson<LiveActionsPermissions>(repoPath(r, "/actions/permissions"));
}

export async function setActionsPermissions(
  r: Repo,
  body: LiveActionsPermissions,
): Promise<void> {
  await writeJson("PUT", repoPath(r, "/actions/permissions"), body);
}

/**
 * `GET .../actions/permissions/selected-actions` 409s outright when the
 * repository's `allowed_actions` is not currently `"selected"` — there is
 * no selected-actions allowlist to read when nothing restricts to one.
 * Read as the empty, nothing-allowed list rather than propagating the
 * error: `diff.ts` then reports the honest drift (every field disagrees
 * with `desired.actions`) instead of `commands.ts` failing outright before
 * it can report anything.
 */
export async function getSelectedActions(
  r: Repo,
): Promise<LiveSelectedActions> {
  try {
    return await readJson<LiveSelectedActions>(
      repoPath(r, "/actions/permissions/selected-actions"),
    );
  } catch (err) {
    if (
      err instanceof GhSettingsError &&
      (/\b409\b/.test(err.message) || /\(conflict\)/i.test(err.message))
    ) {
      return {
        github_owned_allowed: false,
        verified_allowed: false,
        patterns_allowed: [],
      };
    }
    throw err;
  }
}

export async function setSelectedActions(
  r: Repo,
  body: LiveSelectedActions,
): Promise<void> {
  await writeJson(
    "PUT",
    repoPath(r, "/actions/permissions/selected-actions"),
    body,
  );
}

export async function getWorkflowPermissions(
  r: Repo,
): Promise<LiveWorkflowPermissions> {
  return readJson<LiveWorkflowPermissions>(
    repoPath(r, "/actions/permissions/workflow"),
  );
}

export async function setWorkflowPermissions(
  r: Repo,
  body: LiveWorkflowPermissions,
): Promise<void> {
  await writeJson("PUT", repoPath(r, "/actions/permissions/workflow"), body);
}

// ── Environments ─────────────────────────────────────────────────────────────

/** `null` when the environment does not exist yet — reported, never created here. */
export async function getEnvironment(
  r: Repo,
  name: string,
): Promise<LiveEnvironment | null> {
  try {
    return await readJson<LiveEnvironment>(
      repoPath(r, `/environments/${encodeURIComponent(name)}`),
    );
  } catch (err) {
    if (err instanceof GhSettingsError && /\b404\b/.test(err.message))
      return null;
    throw err;
  }
}

export async function getDeploymentBranchPolicies(
  r: Repo,
  name: string,
): Promise<LiveBranchPolicy[]> {
  const data = await readJson<{ branch_policies?: LiveBranchPolicy[] }>(
    repoPath(
      r,
      `/environments/${encodeURIComponent(name)}/deployment-branch-policies`,
    ),
  );
  return data.branch_policies ?? [];
}

export async function setDeploymentBranchPolicyMode(
  r: Repo,
  name: string,
  mode: LiveDeploymentBranchPolicy,
): Promise<void> {
  await writeJson(
    "PUT",
    repoPath(r, `/environments/${encodeURIComponent(name)}`),
    {
      deployment_branch_policy: mode,
    },
  );
}

export async function addDeploymentBranchPolicy(
  r: Repo,
  name: string,
  pattern: string,
): Promise<void> {
  await writeJson(
    "POST",
    repoPath(
      r,
      `/environments/${encodeURIComponent(name)}/deployment-branch-policies`,
    ),
    { name: pattern },
  );
}

export async function deleteDeploymentBranchPolicy(
  r: Repo,
  name: string,
  policyId: number,
): Promise<void> {
  await writeJson(
    "DELETE",
    repoPath(
      r,
      `/environments/${encodeURIComponent(name)}/deployment-branch-policies/${policyId}`,
    ),
  );
}
