/**
 * Worker secrets nothing declares: the check `env audit` runs for its target
 * (`--prune` deletes what it finds), and the deprecated
 * `devtools-ci deploy orphans [--prune]` step, which still runs it for CI.
 *
 * Reports, and only when asked deletes, Worker secrets nothing declares.
 *
 * ## Why there is anything to audit
 *
 * `wrangler deploy --secrets-file` applies additively: it preserves every
 * secret it does not mention. So renaming a variable, or dropping one, leaves
 * the old secret on the Worker indefinitely, and nothing else in the system can
 * see it. Bitwarden does not know about it, GitHub does not, and the app's
 * schema stopped mentioning it. Cloudflare will hold a credential nobody has
 * thought about for a year.
 *
 * The expected set is derived from the app's own manifest: every key it
 * declares with `secrecy: "secret"`. That deliberately includes the MINTED
 * ones. `SANDBOX_PROXY_TOKEN` has no copy in Bitwarden or GitHub by design, and
 * an audit that reasoned from stored copies alone would report the live proxy
 * credential as safe to delete. (`env audit` had exactly that bug; see
 * `EnvMeta.minted`.)
 *
 * ## Report always, prune almost never (security plan §3.6)
 *
 *   report   every production deploy      environment: production
 *   prune    `workflow_dispatch` only     environment: production-apply
 *
 * **Orphans never fail the deploy.** A stale secret name is not a defect in the
 * change being deployed, and failing on it would make an unrelated commit
 * responsible for a cleanup somebody else deferred. So the reporting path
 * returns normally even when it found something; the only non-zero exit here is
 * a deletion that was asked for and did not happen.
 *
 * **Pruning must not chain to a deploy.** Deleting a secret publishes a new
 * version of the currently deployed code with the secret gone. There is no way
 * to change a secret without publishing. Auto-pruning would turn every deploy
 * carrying an orphan into TWO version publishes, and the second one bypasses
 * both the promotion PR and the `production-apply` approval that the first went
 * through. That is why this is a separate, human-triggered run, and why
 * `--prune` is the only thing that can reach `deleteSecret`: a default that
 * deleted would be a default that deployed.
 *
 * > **Names only.** Cloudflare never returns a secret's value, so a secret
 * > whose VALUE is wrong is undetectable here. A clean audit means "no name is
 * > unaccounted for", not "the configuration is correct".
 *
 * Recovery from a wrong prune is real but not instant: Bitwarden is the source
 * of truth and every deploy sends the complete set, so a wrongly deleted secret
 * comes back on the next deploy, with an outage in between.
 *
 * ## Interface
 *
 * Reads secret NAMES from Cloudflare and needs no env file, so CI runs it with
 * `--no-env`: there is no `.env.production` in the job that audits, and
 * demanding one would be demanding the whole credential set to list some
 * names.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { EnvEntry } from "@devdogsuga/env";
import { assertRegistryLoaded } from "@devdogsuga/cli-core/env/discovery";
import { listWorkerSecrets, workerApps } from "./cloudflare.js";
import { getEnvSync } from "@devdogsuga/cli-core/repo/peers";
import { findRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { DeployError, say, summary } from "../deploy/report.js";
import { requireCloudflareToken } from "../deploy/token.js";

export interface OrphansOptions {
  /** `--prune`: delete what it found. Nothing else in here can delete. */
  prune: boolean;
  /** Defaults to the ambient environment; a parameter so tests need not mutate it. */
  env?: NodeJS.ProcessEnv;
  /** Project root; the CLI passes the real one. A parameter for the tests. */
  root?: string;
  /** Injectable so the tests need neither wrangler nor a Cloudflare token. */
  listSecrets?: typeof listWorkerSecrets;
  /** Injectable for the same reason. The tests assert it is NOT called without `--prune`. */
  deleteSecret?: (app: string, key: string, environment: string) => void;
}

export interface OrphansResult {
  /** How many names nothing declares, across every readable Worker. */
  orphans: number;
  /** `worker/key` for each deletion that happened. Empty unless `--prune`. */
  pruned: string[];
}

/**
 * Deletes one secret through wrangler.
 *
 * Wrangler prompts before deleting and takes the default when stdin is not a
 * TTY, which on a runner it is not. `stdio: "inherit"` keeps its own output on
 * the job log where a reviewer approving this can read it.
 */
function deleteViaWrangler(
  root: string,
  app: string,
  key: string,
  environment: string,
): void {
  execFileSync(
    "pnpm",
    // WRANGLER's `--env` is a wrangler.jsonc environment block. Unrelated to
    // devtools' `--target`, and not renamed with it.
    ["exec", "wrangler", "secret", "delete", key, "--env", environment],
    { cwd: join(root, "apps", app), stdio: "inherit", shell: false },
  );
}

/**
 * Names the app's manifest declares for its Worker: secrets (stored or minted)
 * AND public server keys. `secrets-file` ships both since 2026-08-20, so a
 * public key on the Worker is expected, not an orphan.
 */
function expectedFor(app: string): Set<string> {
  const keys = new Set<string>();
  for (const [key, entries] of getEnvSync().variables()) {
    const own = entries.filter((e: EnvEntry) => e.source === app && !e.client);
    if (own.length === 0) continue;
    if (
      own.some(
        (e) => e.meta.secrecy === "secret" || e.meta.secrecy === "public",
      )
    ) {
      keys.add(key);
    }
  }
  return keys;
}

/** A Worker secret nothing declares. */
export interface Orphan {
  app: string;
  /** `<environment>-<app>`, the Worker's name. */
  worker: string;
  key: string;
}

/**
 * Every secret on the Workers `secrets` names that its app's manifest does not
 * declare, sorted by key within a Worker. `environment` is the target the
 * Workers were listed for.
 */
export function findOrphans(
  environment: string,
  secrets: ReadonlyMap<string, ReadonlySet<string>>,
): Orphan[] {
  const found: Orphan[] = [];
  for (const app of workerApps()) {
    const worker = `${environment}-${app}`;
    const names = secrets.get(worker);
    if (!names) continue;
    const expected = expectedFor(app);
    for (const key of [...names].sort()) {
      if (!expected.has(key)) found.push({ app, worker, key });
    }
  }
  return found;
}

/**
 * Deletes each orphan, stopping at the first failure. Returns every deletion
 * that happened; the failure, if any, rides in `failed`.
 */
export function pruneOrphans(
  orphans: readonly Orphan[],
  environment: string,
  deleteSecret: (app: string, key: string, environment: string) => void,
): { pruned: Orphan[]; failed?: Orphan } {
  const pruned: Orphan[] = [];
  for (const orphan of orphans) {
    try {
      deleteSecret(orphan.app, orphan.key, environment);
      pruned.push(orphan);
    } catch {
      return { pruned, failed: orphan };
    }
  }
  return { pruned };
}

/** Deletes one orphan through wrangler (`apps/<app>`, wrangler's own prompts off). */
export function deleteOrphanViaWrangler(
  app: string,
  key: string,
  environment: string,
  root: string = findRepoRoot(),
): void {
  requireCloudflareToken("delete a Worker secret");
  deleteViaWrangler(root, app, key, environment);
}

export async function runDeployOrphans(
  options: OrphansOptions,
): Promise<OrphansResult> {
  assertRegistryLoaded();

  const env = options.env ?? process.env;
  const root = options.root ?? findRepoRoot();
  const listSecrets = options.listSecrets ?? listWorkerSecrets;
  const deleteSecret =
    options.deleteSecret ??
    ((app, key, environment) => deleteViaWrangler(root, app, key, environment));

  // Up front, as `deploy <app>` does: with the token absent wrangler would open
  // a browser login. Skipped when a test injects the listing.
  if (options.listSecrets === undefined) {
    requireCloudflareToken("audit Worker secrets", env);
  }

  const environment = getEnvSync().resolveEnvironment(env.DEPLOY_ENV);
  if (environment === "development") {
    throw new DeployError(
      "DEPLOY_ENV must name a deployed environment (staging | production).",
    );
  }

  // Both the job summary and the log, because a run of this IS its report and
  // the two audiences read different places.
  const emit = (lines: readonly string[]): void => {
    summary(lines, env);
    say(lines);
  };

  const { secrets, unreadable } = await listSecrets(environment);

  const lines: string[] = [
    `### Worker secret audit — \`${environment}\``,
    "",
    "Names only: Cloudflare never returns a value, so this cannot see a secret",
    "that is present and wrong.",
    "",
  ];

  let total = 0;
  const toPrune: Orphan[] = [];

  for (const app of workerApps()) {
    const worker = `${environment}-${app}`;
    const found = secrets.get(worker);
    if (!found) continue;

    const expected = expectedFor(app);
    const orphans = [...found].filter((name) => !expected.has(name)).sort();
    total += orphans.length;

    lines.push(
      orphans.length === 0
        ? `* \`${worker}\` — ${found.size} secret(s), nothing unaccounted for.`
        : `* \`${worker}\` — **${orphans.length} orphaned**: ${orphans.map((o) => `\`${o}\``).join(", ")}`,
    );
    for (const key of orphans) toPrune.push({ app, worker, key });
  }

  if (unreadable.length > 0) {
    lines.push(
      "",
      `Could not read: ${unreadable.map((w) => `\`${w}\``).join(", ")}. A Worker`,
      "that has never been deployed is the ordinary reason, and the audit still",
      "reports everything it could see — an audit that refuses to run is an",
      "audit nobody runs.",
    );
  }

  if (total === 0) {
    lines.push("", "No orphaned secrets.");
    emit([...lines, ""]);
    return { orphans: 0, pruned: [] };
  }

  if (!options.prune) {
    lines.push(
      "",
      "Nothing was deleted, and this does not fail the deploy — a stale name is",
      "not a defect in the change that was just shipped. To remove them, run",
      "this workflow by hand with **Prune orphaned Worker secrets** ticked; it",
      "goes through the `production-apply` reviewers, because each deletion",
      "publishes a new version of the deployed code.",
      "",
    );
    emit(lines);
    return { orphans: total, pruned: [] };
  }

  lines.push("", "Pruning:");
  const { pruned, failed } = pruneOrphans(toPrune, environment, deleteSecret);
  for (const { worker, key } of pruned) {
    lines.push(`* deleted \`${key}\` from \`${worker}\``);
  }
  if (failed) {
    // Fatal HERE and only here: this run exists to delete these, so a failure
    // is the whole result rather than a footnote to a deploy. The report goes
    // out before the throw, so the partial result survives the failure.
    lines.push(
      `* **failed** to delete \`${failed.key}\` from \`${failed.worker}\``,
    );
    emit([...lines, ""]);
    throw new DeployError(
      `Could not delete ${failed.key} from ${failed.worker}. Wrangler's own message is above.`,
    );
  }

  emit([
    ...lines,
    "",
    "Each deletion published a new version of the code already deployed. If one",
    "of these was live rather than stale, the next deploy restores it from",
    "Bitwarden — with an outage in between.",
    "",
  ]);

  return {
    orphans: total,
    pruned: pruned.map(({ worker, key }) => `${worker}/${key}`),
  };
}
