/**
 * Whether a verified JWT is a first-party DevDogs session token, as opposed to
 * a credential GoTrue issued to somebody else's OAuth client.
 *
 * "Sign in with DevDogs" hands a client two bearers, both signed with the
 * project's own key and both naming the member as `sub`:
 *
 * - the access token, whose role the token hook downgrades to `oauth_identity`;
 * - the ID token, which the hook never sees and which carries no `role` at all.
 *
 * Both carry `client_id`. PostgREST refuses them (no grants, or the anon
 * role), but this site does not go through PostgREST: it reads the user id out
 * of the session cookie and then queries as the platform. So a client that
 * could put either token in the cookie would be signed in as the member. Only a
 * token with role `authenticated` and no OAuth client is a session.
 */
export function isFirstPartyClaims(claims: {
  role?: unknown;
  client_id?: unknown;
}): boolean {
  if (claims.client_id !== undefined && claims.client_id !== null) return false;
  return claims.role === "authenticated";
}
