/**
 * Resolves the numeric ids `desired.ts`'s bypass actors need, by NAME —
 * never hardcoded, because a team or App id is only stable until somebody
 * deletes and recreates it, and a stale id in a bypass actor is the
 * dangerous failure: the ruleset then blocks the team or App it is named
 * for while letting whoever inherited the old id through (the same
 * reasoning `teamSync.ts`'s `ensureTeamRuleset` gives for always re-writing
 * rather than skipping on an existing ruleset).
 *
 * Both come from plain, read-only `gh api` GETs — no Octokit, same as every
 * other GitHub call in this package.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GhRulesetsError } from "./api.js";

const run = promisify(execFile);

function describe(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  const stderr = (e.stderr ?? "").trim();
  return stderr || e.message || "gh failed with no output.";
}

/** `GET /orgs/{org}/teams/{slug}` -> the team's numeric id. */
export async function resolveTeamId(org: string, slug: string): Promise<number> {
  try {
    const { stdout } = await run("gh", ["api", `orgs/${org}/teams/${slug}`], {
      shell: false,
    });
    const data = JSON.parse(stdout) as { id?: number };
    if (typeof data.id !== "number") {
      throw new GhRulesetsError(`orgs/${org}/teams/${slug} returned no numeric id`);
    }
    return data.id;
  } catch (err) {
    if (err instanceof GhRulesetsError) throw err;
    throw new GhRulesetsError(
      `resolving team "${slug}" in ${org}: ${describe(err)}`,
    );
  }
}

interface Installation {
  app_id: number;
  app_slug: string;
}

/**
 * `GET /orgs/{org}/installations` -> the id of the App installation whose
 * `app_slug` matches, e.g. `devdogs-platform` (production) or
 * `devdogs-platform-staging`.
 *
 * `orgs/{org}/installations` rather than the App's own `/app` endpoint: the
 * latter needs App-JWT auth this CLI has no path to, while the installations
 * list is a plain org-admin GET — the exact command DevDogsUGA's own
 * `docs/platform/guides/identity/github-app.md` already tells an operator to
 * run to verify the App's permission grant.
 */
export async function resolveAppId(org: string, appSlug: string): Promise<number> {
  try {
    const { stdout } = await run("gh", ["api", `orgs/${org}/installations`], {
      shell: false,
    });
    const data = JSON.parse(stdout) as { installations?: Installation[] };
    const match = (data.installations ?? []).find((i) => i.app_slug === appSlug);
    if (!match) {
      throw new GhRulesetsError(
        `no installation with app_slug "${appSlug}" found in orgs/${org}/installations`,
      );
    }
    return match.app_id;
  } catch (err) {
    if (err instanceof GhRulesetsError) throw err;
    throw new GhRulesetsError(`resolving App "${appSlug}" in ${org}: ${describe(err)}`);
  }
}
