import { checkDiscovery } from "../src/server/oauth/issuerCheck";

/**
 * Checks what a Supabase project's OAuth server advertises, for TASK-347.
 *
 *   tsx scripts/check-oauth-issuer.ts --api-url https://devdogsuga.supabase.co \
 *     [--expect-label devdogsuga]
 *
 * Reads `<api-url>/auth/v1/.well-known/openid-configuration` and its JWKS and
 * fails (exit 1) unless a product's `custom:devdogsuga` provider could register
 * against it: the issuer is `https://<project>.supabase.co/auth/v1` (and names
 * `--expect-label` when given), the endpoints are https, dynamic registration
 * is off, and every signing key is asymmetric. Prints the issuer to register
 * either way. It is read-only and sends no credential.
 *
 * Run it against staging after a deploy, and against production (at the Gate)
 * right after the vanity-subdomain switch: the issuer is Supabase's to choose,
 * and whichever host it names is the one products must register, so look at
 * the answer rather than assuming it.
 */
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const apiUrl = (argument("api-url") ?? process.env.API_URL ?? "").replace(
  /\/+$/,
  "",
);
if (!apiUrl) {
  console.error("check-oauth-issuer: pass --api-url or set API_URL.");
  process.exit(2);
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as unknown;
}

const discovery = (await getJson(
  `${apiUrl}/auth/v1/.well-known/openid-configuration`,
)) as { jwks_uri?: unknown };
const jwksUri =
  typeof discovery.jwks_uri === "string"
    ? discovery.jwks_uri
    : `${apiUrl}/auth/v1/.well-known/jwks.json`;
const jwks = (await getJson(jwksUri)) as { keys?: unknown } | null;

const expectLabel = argument("expect-label");
const result = checkDiscovery(discovery, {
  jwks,
  ...(expectLabel ? { expectLabel } : {}),
});

console.log(JSON.stringify({ apiUrl, ...result }, null, 2));
process.exit(result.ok ? 0 : 1);
