import * as Sentry from "@sentry/cloudflare";
import { buildSentryOptions } from "@devdogsuga/sdk/telemetry";

/** The slice of the environment Sentry's setup reads. */
export interface SentryEnv {
  readonly DEPLOY_ENV?: string;
  readonly PLATFORM_SENTRY_DSN?: string;
  readonly SENTRY_RELEASE?: string;
}

/**
 * Sentry options for the catalog Worker and its Workflows, or `undefined`
 * with no DSN (local development), which `withSentry` and
 * `instrumentWorkflowWithSentry` both treat as "off".
 *
 * The catalog has no Sentry project of its own yet, so it reports to the
 * platform's, as `service:platform` with a `worker:catalog` tag to search on.
 * Warn and error console lines go to Sentry Logs, as in the other Workers: this
 * code logs through `console`.
 */
export function catalogSentryOptions(env: SentryEnv) {
  const options = buildSentryOptions({
    service: "platform",
    environment: env.DEPLOY_ENV ?? "development",
    dsn: env.PLATFORM_SENTRY_DSN,
    release: env.SENTRY_RELEASE,
  });
  if (!options) return undefined;
  return {
    ...options,
    initialScope: {
      tags: { ...tagsOf(options.initialScope), worker: "catalog" },
    },
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    ],
  };
}

function tagsOf(scope: unknown): Record<string, string> {
  const tags = (scope as { tags?: Record<string, string> } | undefined)?.tags;
  return tags ?? {};
}
