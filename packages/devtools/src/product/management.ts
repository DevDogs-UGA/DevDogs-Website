/**
 * The two hosted-project auth settings "Sign in with DevDogs" needs and a
 * contributor would otherwise click through the dashboard for:
 *
 *   * `custom_oauth_enabled`: off by default, and GoTrue's custom-provider
 *     endpoint answers 404 "Custom OAuth providers are disabled" until it is
 *     on, so registering `custom:devdogsuga` fails without it;
 *   * `uri_allow_list`: the app's return addresses, which the local stack
 *     reads from `supabase/config.toml` instead.
 *
 * Both are the Management API's `PATCH /v1/projects/{ref}/config/auth`, with a
 * personal access token (`SUPABASE_ACCESS_TOKEN`, from the dashboard's Access
 * Tokens page). Without a token `setup` prints the two dashboard steps.
 */

const API = "https://api.supabase.com";

export class ManagementError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ManagementError";
  }
}

/** The project ref in `https://<ref>.supabase.co`, or null for a custom domain or local URL. */
export function projectRefOf(apiUrl: string): string | null {
  try {
    return (
      /^([a-z0-9]{20})\.supabase\.co$/.exec(new URL(apiUrl).hostname)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

/** The allow list with `wanted` added, keeping what was there; comma-separated as GoTrue stores it. */
export function mergeAllowList(
  current: string | null | undefined,
  wanted: readonly string[],
): string {
  const entries = (current ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const uri of wanted) if (!entries.includes(uri)) entries.push(uri);
  return entries.join(",");
}

export interface AuthSettingsInput {
  projectRef: string;
  token: string;
  redirectUris: readonly string[];
  fetch?: typeof fetch;
}

export async function ensureHostedAuthSettings(
  input: AuthSettingsInput,
): Promise<{ changed: string[] }> {
  const doFetch = input.fetch ?? fetch;
  const headers = {
    authorization: `Bearer ${input.token}`,
    "content-type": "application/json",
  };
  const url = `${API}/v1/projects/${input.projectRef}/config/auth`;

  const current = await doFetch(url, { headers });
  if (!current.ok) {
    throw new ManagementError(
      current.status === 401 || current.status === 403
        ? "The Supabase access token was refused. Create one at https://supabase.com/dashboard/account/tokens."
        : `Reading the project's auth settings failed (${current.status}).`,
      current.status,
    );
  }
  const settings = (await current.json()) as {
    custom_oauth_enabled?: boolean;
    uri_allow_list?: string | null;
  };

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  if (settings.custom_oauth_enabled !== true) {
    patch["custom_oauth_enabled"] = true;
    changed.push("custom_oauth_enabled");
  }
  const allow = mergeAllowList(settings.uri_allow_list, input.redirectUris);
  if (allow !== (settings.uri_allow_list ?? "")) {
    patch["uri_allow_list"] = allow;
    changed.push("uri_allow_list");
  }
  if (changed.length === 0) return { changed };

  const response = await doFetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new ManagementError(
      `Updating the project's auth settings failed (${response.status}).`,
      response.status,
    );
  }
  return { changed };
}
