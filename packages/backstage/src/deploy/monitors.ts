/**
 * `deploy prune-monitors`: deletes the Sentry Crons monitors an app no longer
 * declares.
 *
 * Sentry creates a monitor the first time a job checks in, and never removes
 * one. Rename or drop a `monitorSlug` and the old monitor keeps expecting
 * check-ins that will never come, opening a "missed check-in" issue every
 * period until someone deletes it by hand (PLATFORM-2: the Discord role sync
 * folded into the fifteen-minute cron, and its ten-minute monitor alerted
 * every ten minutes after the deploy).
 *
 * The declared set is every `monitorSlug` on the entries of the app's
 * `cloudflare/scheduled.ts` exports `CRON_ROUTES` and `WORKFLOW_CRONS`. Every
 * monitor in the app's Sentry project that is not in it, and whose slug
 * starts with `<app>-`, is deleted. The prefix keeps a monitor someone made
 * by hand in the Sentry UI out of reach.
 *
 * Delete, not disable. Sentry drops every check-in sent to a disabled monitor
 * and never re-enables one from a check-in, so a slug that came back would
 * report nowhere. A deleted one is recreated by the next check-in that
 * carries its config (each `withMonitor`/`captureCheckIn` here does), and the
 * delete renames the old slug first, so the name is free at once.
 *
 * Production only. Monitors belong to a project, not a tier, and staging
 * deploys `main`, which can be ahead of production: a monitor `main` dropped
 * still has a production job checking in to it.
 *
 * `SENTRY_MONITORS_TOKEN`, not `SENTRY_AUTH_TOKEN`: the deploy token is an
 * organization token (`org:ci`), which Sentry lets neither list nor delete
 * monitors. This one needs `alerts:write` (`alerts:read` to list), and is
 * held in this step's `env:` alone. Absent, the step is skipped with a
 * notice, the same as the Sentry release check.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { appDirFor } from "@devdogsuga/cli-core/repo/layout";
import { DeployError, say } from "./report.js";
import type { Tier } from "./smoke-config.js";

const SENTRY_API = "https://sentry.io/api/0";

export type SentryFetch = (
  url: string,
  init: { method?: "GET" | "DELETE"; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

/** Only the field read here; the exports' own shapes are devtools' to check. */
const Declarations = z.record(
  z.string(),
  z.object({ monitorSlug: z.string().min(1).optional() }),
);

const MonitorList = z.array(z.object({ slug: z.string() }));

/**
 * Every `monitorSlug` the app's `cloudflare/scheduled.ts` declares, or
 * `undefined` when the app has no such file (no crons, nothing to prune).
 */
export async function declaredMonitorSlugs(
  app: string,
  root?: string,
): Promise<Set<string> | undefined> {
  const path = join(appDirFor(app, root), "cloudflare", "scheduled.ts");
  if (!existsSync(path)) return undefined;

  const mod = (await import(pathToFileURL(path).href)) as Record<
    string,
    unknown
  >;
  const slugs = new Set<string>();
  for (const name of ["CRON_ROUTES", "WORKFLOW_CRONS"]) {
    const parsed = Declarations.safeParse(mod[name] ?? {});
    if (!parsed.success) {
      throw new DeployError(`${path}: ${name} is not a map of entries.`);
    }
    for (const entry of Object.values(parsed.data)) {
      if (entry.monitorSlug) slugs.add(entry.monitorSlug);
    }
  }
  return slugs;
}

/** The `rel="next"` URL of a Sentry `Link` header, when it has results. */
export function nextPage(link: string | null): string | undefined {
  for (const part of link?.split(",") ?? []) {
    if (part.includes('rel="next"') && part.includes('results="true"')) {
      return /<([^>]+)>/.exec(part)?.[1];
    }
  }
  return undefined;
}

async function listMonitorSlugs(
  org: string,
  project: string,
  headers: Record<string, string>,
  fetchImpl: SentryFetch,
): Promise<string[]> {
  const slugs: string[] = [];
  let url: string | undefined =
    `${SENTRY_API}/organizations/${org}/monitors/?project=${encodeURIComponent(project)}`;
  while (url) {
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new DeployError(
        `Listing Sentry monitors: HTTP ${response.status}.`,
        ["SENTRY_MONITORS_TOKEN needs alerts:read and alerts:write."],
      );
    }
    slugs.push(...MonitorList.parse(await response.json()).map((m) => m.slug));
    url = nextPage(response.headers.get("link"));
  }
  return slugs;
}

export interface PruneOptions {
  app: string;
  tier: Tier;
  dryRun?: boolean;
  /** Defaults to the ambient environment. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to the checkout's `scheduled.ts`. */
  declared?: Set<string>;
  fetchImpl?: SentryFetch;
}

/** Returns the slugs it deleted (or would have, on a dry run). */
export async function runPruneMonitors(
  options: PruneOptions,
): Promise<string[]> {
  const env = options.env ?? process.env;
  const { app } = options;

  if (options.tier !== "production") {
    say([
      `prune-monitors: skipped on ${options.tier}; monitors are pruned against production only.`,
    ]);
    return [];
  }
  const token = env.SENTRY_MONITORS_TOKEN;
  if (!token) {
    say([
      "::notice::Sentry monitor pruning skipped -- SENTRY_MONITORS_TOKEN is not configured.",
    ]);
    return [];
  }
  if (!env.SENTRY_ORG) {
    throw new DeployError("SENTRY_ORG is not set.");
  }

  const declared = options.declared ?? (await declaredMonitorSlugs(app));
  if (!declared) {
    say([
      `prune-monitors: ${app} has no cloudflare/scheduled.ts; nothing to prune.`,
    ]);
    return [];
  }

  const headers = { authorization: `Bearer ${token}` };
  const fetchImpl = options.fetchImpl ?? fetch;
  const existing = await listMonitorSlugs(
    env.SENTRY_ORG,
    app,
    headers,
    fetchImpl,
  );
  const orphans = existing.filter(
    (slug) => slug.startsWith(`${app}-`) && !declared.has(slug),
  );

  if (orphans.length === 0) {
    say([`prune-monitors: every ${app} monitor is declared.`]);
    return [];
  }
  for (const slug of orphans) {
    if (options.dryRun) {
      say([`Would delete Sentry monitor ${slug}`]);
      continue;
    }
    const url = `${SENTRY_API}/projects/${env.SENTRY_ORG}/${app}/monitors/${encodeURIComponent(slug)}/`;
    const response = await fetchImpl(url, { method: "DELETE", headers });
    // 404: already gone (or pending deletion), which is the goal.
    if (!response.ok && response.status !== 404) {
      throw new DeployError(
        `Deleting Sentry monitor ${slug}: HTTP ${response.status}.`,
      );
    }
    say([`Deleted Sentry monitor ${slug}`]);
  }
  return orphans;
}
