/**
 * Refuse the one-approval path when the default branch has no required-review
 * protection.
 *
 * With ONE_APPROVAL on, the `production` environment has no reviewers, so the
 * only thing between a push and the production secrets is what stops a push to
 * `main` that was not reviewed. That is a ruleset requiring a pull request with
 * at least one approving review. A repository without one (DogPack today) must
 * not take the one-approval path: any writer could push a workflow that names
 * `production` and read its secrets with nobody approving.
 *
 * Read with the job token: `GET /repos/{repo}/rules/branches/{branch}` lists the
 * active rules that apply to the branch and needs only read access. Rulesets
 * only: classic branch protection settings need admin to read, so a repository
 * protected that way is refused too, with a message saying so. Whether the
 * ruleset can be bypassed (bypass_actors) is not visible to this token; that
 * stays a manual check in docs/operations/deploys/one-approval.md.
 *
 * Usage: GH_TOKEN=... node main-protection.mjs --repo OWNER/REPO --branch main
 */
import { createApi } from "./github-api.mjs";
import { isMain } from "./is-main.mjs";

/**
 * @param {any} rules  The array the rules endpoint returns.
 * @returns {{ ok: boolean, message: string }}
 */
export function judgeRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const review = list.find(
    (rule) =>
      rule?.type === "pull_request" &&
      Number(rule.parameters?.required_approving_review_count ?? 0) >= 1,
  );
  if (review) {
    return {
      ok: true,
      message: `The default branch requires a pull request with ${review.parameters.required_approving_review_count} approving review(s) (ruleset ${review.ruleset_id ?? "?"}).`,
    };
  }
  const pullRequestOnly = list.some((rule) => rule?.type === "pull_request");
  return {
    ok: false,
    message: pullRequestOnly
      ? "The default branch requires a pull request but no approving review. With ONE_APPROVAL on, `production` has no reviewers, so an unreviewed merge would deploy. Set required approvals to 1 or more."
      : "The default branch has no active ruleset that requires a pull request with an approving review (classic branch protection cannot be read with the job token and does not count). With ONE_APPROVAL on, `production` has no reviewers, so anyone who can push to the branch could read the production secrets. Apply the main ruleset first (Gate step 6), or delete the ONE_APPROVAL variable and put the required reviewers back on `production`.",
  };
}

/**
 * @param {{ api: (path: string) => Promise<any>, repo: string, branch: string }} options
 */
export async function checkProtection({ api, repo, branch }) {
  const rules = await api(
    `/repos/${repo}/rules/branches/${encodeURIComponent(branch)}`,
  );
  return judgeRules(rules);
}

/** @param {string[]} argv @param {string} name */
function flag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = flag(argv, "--repo");
  const branch = flag(argv, "--branch") ?? "main";
  const token = process.env.GH_TOKEN;
  if (!repo || !token) {
    console.error(
      "usage: GH_TOKEN=... main-protection.mjs --repo OWNER/REPO [--branch main]",
    );
    process.exit(2);
  }
  const verdict = await checkProtection({
    api: createApi({ token }),
    repo,
    branch,
  });
  if (!verdict.ok) {
    console.error(`::error::${verdict.message}`);
    process.exit(1);
  }
  console.log(verdict.message);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    // Fail closed: what cannot be read is not protection.
    console.error(
      `::error::Could not read the default branch's rules (${err instanceof Error ? err.message : err}), so the one-approval path is refused.`,
    );
    process.exit(1);
  });
}
