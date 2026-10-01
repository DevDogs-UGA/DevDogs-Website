/**
 * The Cloudflare token check every command that talks to Cloudflare runs up
 * front (`deploy <app>`, `env audit`'s Worker listing and `--prune`, and the
 * deprecated `deploy orphans`). It used to be its own command,
 * `deploy require-token`, a guard chained in front of a deploy.
 *
 * Refuses when `CLOUDFLARE_API_TOKEN` is absent. Without it, wrangler falls
 * back to an interactive browser OAuth prompt, which on a contributor's machine
 * reads as an invitation to authenticate. The policy (design doc §9) is that
 * only devops hold the token and nobody else deploys.
 *
 * `cf:build:*` scripts deliberately do NOT check: building needs no token.
 */
import { DeployError } from "./report.js";

/** The refusal, for a caller that wants to print it rather than throw. */
export function cloudflareTokenRefusal(what: string): DeployError {
  return new DeployError(
    `CLOUDFLARE_API_TOKEN is not set — refusing to ${what}.`,
    [
      "Cloudflare access is devops-only (design doc §9). Without this check",
      "wrangler falls back to an interactive browser login, which looks like",
      "an invitation to authenticate rather than the refusal it should be.",
      "",
      "Ask the devops team to run this. If you are joining them, the token",
      "lives in the devops .env.production:",
      "  backstage env pull --target production",
    ],
  );
}

/**
 * Refuses when `CLOUDFLARE_API_TOKEN` is absent, and says nothing when it is
 * set. The silence is deliberate: this stands in front of a deploy, and a check
 * that announces itself on every run is a check people stop reading.
 *
 * @throws {DeployError} when `CLOUDFLARE_API_TOKEN` is absent or empty.
 */
export function requireCloudflareToken(
  what: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.CLOUDFLARE_API_TOKEN) return;
  throw cloudflareTokenRefusal(what);
}
