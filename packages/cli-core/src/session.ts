/**
 * Pieces of tier resolution both launchers use.
 */
import { select } from "@clack/prompts";
import type * as EnvSessionModule from "@devdogsuga/env/session";
import type {
  SessionTierResolution,
  TierChoice,
} from "@devdogsuga/env/session";
import { nonEmpty } from "./db/connection.js";
import { unwrap } from "./ui.js";

/** The real interactive picker: a clack `select`, unwrapped so Ctrl-C exits
 * cleanly instead of leaking a cancel symbol into `resolveSessionTier`.
 * Values are session selector words (`"development:local"`, `"staging"`…). */
export async function promptTier(
  message: string,
  choices: TierChoice[],
): Promise<string> {
  return unwrap(await select<string>({ message, options: choices }));
}

/**
 * The session for `--no-env`: the named tier, parsed and nothing more.
 * `--tier` wins over `DEPLOY_ENV`, and a run that names neither is plain
 * development.
 */
export function resolveWithoutEnv(
  envSession: typeof EnvSessionModule,
  explicit: string | undefined,
): SessionTierResolution {
  const selector =
    explicit ?? nonEmpty(process.env.DEPLOY_ENV) ?? "development";
  const parsed = envSession.parseSessionSelector(selector);
  if (parsed === null) {
    return {
      ok: false,
      reason:
        `unknown tier "${selector}". Expected: development, ` +
        `${envSession.SESSION_SELECTORS.join(", ")}.`,
    };
  }
  return { ok: true, ...parsed, resolvedBy: "explicit" };
}
