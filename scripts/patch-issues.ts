/**
 * `populate:patch-issues`: one GitHub issue per removable pnpm patch.
 *
 *   node scripts/patch-audit.ts --json > patch-report.json
 *   node scripts/patch-issues.ts patch-report.json [--dry-run]
 *
 * Reads the report `check:patches --json` writes and, for every patch whose
 * state is `removable`, makes sure ONE open issue titled `Remove patch <key>`
 * exists in $GITHUB_REPOSITORY: created when absent, its body refreshed when
 * the audit now says something different. Issues are matched by exact title,
 * so re-running (the scheduled toolchain job runs daily) never duplicates one.
 * Nothing is ever closed: whoever removes the patch closes the issue, and a
 * patch that stops being removable simply stops being updated.
 *
 * Needs GITHUB_TOKEN with `issues: write`; --dry-run prints the plan and
 * touches no network.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { PatchReport } from "./patch-audit.ts";

export interface ExistingIssue {
  number: number;
  title: string;
  body: string | null;
}

export type IssueAction =
  | { kind: "create"; title: string; body: string }
  | { kind: "update"; number: number; title: string; body: string }
  | { kind: "keep"; number: number; title: string };

export const issueTitle = (key: string): string => `Remove patch ${key}`;

export function issueBody(report: PatchReport): string {
  const upstream = report.upstream
    .map((u) => `- ${u.url} (${u.state}${u.date ? `, ${u.date}` : ""})`)
    .join("\n");
  return [
    `The upstream fix for \`${report.key}\` has landed and \`${report.releasedIn}@${report.fixVersion}\` is published, so this patch can go.`,
    "",
    `**To do:** ${report.action}.`,
    "",
    `Upstream (${report.anyOf ? "any one" : "all"} must resolve), resolved ${report.resolvedAt}:`,
    upstream,
    "",
    `Installed: \`${report.releasedIn}@${report.installed ?? "unknown"}\`. Patch file: \`patches/${report.file}\`.`,
    "",
    "DevDogsUGA keeps the same patches until it stops building with them; remove them there too, or `check:toolchain` fails.",
    "",
    "_Opened by the scheduled toolchain job (`scripts/patch-issues.ts`); it refreshes this text but never closes the issue._",
  ].join("\n");
}

export function planIssues(
  reports: PatchReport[],
  existing: ExistingIssue[],
): IssueAction[] {
  const byTitle = new Map<string, ExistingIssue>();
  // The oldest issue wins a duplicated title.
  for (const issue of [...existing].sort((a, b) => a.number - b.number)) {
    if (!byTitle.has(issue.title)) byTitle.set(issue.title, issue);
  }
  const actions: IssueAction[] = [];
  for (const report of reports) {
    if (report.state !== "removable") continue;
    const title = issueTitle(report.key);
    const body = issueBody(report);
    const found = byTitle.get(title);
    if (!found) actions.push({ kind: "create", title, body });
    else if ((found.body ?? "") !== body)
      actions.push({ kind: "update", number: found.number, title, body });
    else actions.push({ kind: "keep", number: found.number, title });
  }
  return actions;
}

export interface Api {
  fetch: typeof fetch;
  repo: string;
  token: string;
}

async function call(
  api: Api,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const res = await api.fetch(
    `https://api.github.com/repos/${api.repo}${path}`,
    {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${api.token}`,
        "User-Agent": "devdogsuga-patch-issues",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    },
  );
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} for ${init.method ?? "GET"} ${path}`,
    );
  }
  return res.json();
}

/** Every open issue (pull requests excluded), paged. */
export async function listOpenIssues(api: Api): Promise<ExistingIssue[]> {
  const found: ExistingIssue[] = [];
  for (let page = 1; ; page++) {
    const batch = (await call(
      api,
      `/issues?state=open&per_page=100&page=${page}`,
    )) as (ExistingIssue & { pull_request?: unknown })[];
    for (const issue of batch) {
      if (issue.pull_request) continue;
      found.push({
        number: issue.number,
        title: issue.title,
        body: issue.body,
      });
    }
    if (batch.length < 100) return found;
  }
}

export async function applyPlan(
  api: Api,
  actions: IssueAction[],
): Promise<string[]> {
  const log: string[] = [];
  for (const action of actions) {
    if (action.kind === "create") {
      const created = (await call(api, "/issues", {
        method: "POST",
        body: { title: action.title, body: action.body },
      })) as { number: number };
      log.push(`created #${created.number}: ${action.title}`);
    } else if (action.kind === "update") {
      await call(api, `/issues/${action.number}`, {
        method: "PATCH",
        body: { body: action.body },
      });
      log.push(`updated #${action.number}: ${action.title}`);
    } else {
      log.push(`unchanged #${action.number}: ${action.title}`);
    }
  }
  return log;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("usage: patch-issues.ts <patch-report.json> [--dry-run]");
    return 1;
  }
  const { patches } = JSON.parse(readFileSync(file, "utf8")) as {
    patches: PatchReport[];
  };

  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (dryRun) {
    const plan = planIssues(patches, []);
    for (const action of plan)
      console.log(`would create: ${"title" in action ? action.title : ""}`);
    if (plan.length === 0) console.log("no removable patches");
    return 0;
  }
  if (!repo || !token) {
    console.error("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
    return 1;
  }
  const api: Api = { fetch, repo, token };
  const plan = planIssues(patches, await listOpenIssues(api));
  const log = await applyPlan(api, plan);
  for (const line of log) console.log(line);
  if (log.length === 0) console.log("no removable patches");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
