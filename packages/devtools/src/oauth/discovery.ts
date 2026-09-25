/**
 * OIDC discovery for the DevDogs OAuth server.
 *
 * The wizard used to build the issuer it registered with Supabase as
 * `${baseUrl}/auth/v1` — an assumption, not a fact. Supabase Auth's own
 * discovery document at that same base advertises a DIFFERENT issuer (its
 * project ref host, e.g. `https://<ref>.supabase.co/auth/v1`, rather than
 * the custom domain a caller reaches it through), and Supabase's OIDC
 * provider refuses to register a custom provider whose declared issuer
 * disagrees with what discovery reports for it. Reading the issuer FROM
 * discovery, rather than constructing it, keeps this correct regardless of
 * which host the platform's own discovery document happens to advertise —
 * including once the platform starts advertising its custom domain instead
 * of the underlying project host.
 */

/** Thrown when discovery cannot be fetched or does not shape up as expected. */
export class DiscoveryError extends Error {}

/**
 * Fetches `${baseUrl}/auth/v1/.well-known/openid-configuration` and returns
 * the `issuer` it advertises.
 *
 * Every failure names the discovery URL it was trying to reach — a network
 * failure, a non-2xx response, unparsable JSON, and a missing/non-string
 * `issuer` field are each reported distinctly, so the wizard can print
 * something more useful than "fetch failed".
 */
export async function fetchIssuer(baseUrl: string): Promise<string> {
  const discoveryUrl = `${baseUrl}/auth/v1/.well-known/openid-configuration`;

  let response: Response;
  try {
    response = await fetch(discoveryUrl);
  } catch (err) {
    throw new DiscoveryError(
      `Could not reach ${discoveryUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new DiscoveryError(
      `${discoveryUrl} returned ${response.status} ${response.statusText}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DiscoveryError(`${discoveryUrl} did not return valid JSON`);
  }

  const issuer =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).issuer
      : undefined;

  if (typeof issuer !== "string" || issuer.length === 0) {
    throw new DiscoveryError(
      `${discoveryUrl} response had no "issuer" field`,
    );
  }

  return issuer;
}
