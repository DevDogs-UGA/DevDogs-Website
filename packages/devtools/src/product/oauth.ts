/**
 * "Sign in with DevDogs" for a product's development database, without
 * prompts: the non-interactive halves of `devtools oauth`.
 *
 * The wizard (`../oauth/wizard.ts`) is the front door and is what `setup`
 * runs for a person. These two exist for the cases that have no person:
 *
 *   * a fresh-machine or CI run that already holds an OAuth client's id and
 *     secret (`DEVDOGS_OAUTH_CLIENT_ID` / `DEVDOGS_OAUTH_CLIENT_SECRET`);
 *   * `db sync --rebuild`, which resets the local database and with it
 *     `auth.custom_oauth_providers`, so the provider is registered again from
 *     the credentials the wizard saved to `.env.local`.
 */
import { join } from "node:path";
import { OAUTH } from "@devdogsuga/sdk/constants";
import {
  DEFAULT_API_URLS,
  ENV_KEYS,
  PROVIDER_IDENTIFIER,
  PROVIDER_NAME,
} from "../oauth/config.js";
import { upsertDevDogsProvider } from "../oauth/db.js";
import { fetchIssuerFromAny } from "../oauth/discovery.js";
import { readEnvFile, upsertEnvFile } from "./env.js";
import type { DbTarget } from "./target.js";

export class OAuthRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthRegistrationError";
  }
}

export interface Credentials {
  clientId: string;
  clientSecret: string;
  /** The platform's API base, when not the default hosts. */
  baseUrl?: string | undefined;
}

export function credentialsFromEnv(env: NodeJS.ProcessEnv): Credentials | null {
  const clientId = env["DEVDOGS_OAUTH_CLIENT_ID"];
  const clientSecret = env["DEVDOGS_OAUTH_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, baseUrl: env["DEVDOGS_OAUTH_BASE_URL"] };
}

/** Registers `custom:devdogsuga` on the target with these credentials. */
export async function registerProvider(
  root: string,
  target: DbTarget,
  credentials: Credentials,
): Promise<{ identifier: string; issuer: string }> {
  const bases = credentials.baseUrl ? [credentials.baseUrl] : DEFAULT_API_URLS;
  const { issuer } = await fetchIssuerFromAny(bases);
  const row = await upsertDevDogsProvider(
    { apiUrl: target.apiUrl, serviceRoleKey: target.secretKey },
    {
      identifier: OAUTH.providerId,
      name: PROVIDER_NAME,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      issuer,
    },
  );
  // The same file the wizard writes, so a later rebuild finds them.
  upsertEnvFile(join(root, ".env.local"), {
    [ENV_KEYS.clientId]: credentials.clientId,
    [ENV_KEYS.clientSecret]: credentials.clientSecret,
  });
  return row;
}

/** Registers the provider again from what the wizard saved to `.env.local`. */
export async function reRegisterSavedProvider(
  root: string,
  target: DbTarget,
): Promise<{ identifier: string; issuer: string }> {
  const saved = readEnvFile(join(root, ".env.local"));
  const clientId = saved[ENV_KEYS.clientId];
  const clientSecret = saved[ENV_KEYS.clientSecret];
  if (!clientId || !clientSecret) {
    throw new OAuthRegistrationError(
      'No saved OAuth client in .env.local, so "Sign in with DevDogs" cannot be registered again automatically. Run `devtools oauth`.',
    );
  }
  return registerProvider(root, target, {
    clientId,
    clientSecret,
    baseUrl: saved[ENV_KEYS.baseUrl],
  });
}

export const PROVIDER_ID = PROVIDER_IDENTIFIER;
