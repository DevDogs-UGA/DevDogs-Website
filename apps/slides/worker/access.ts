// Cloudflare Access in front of the hosted deck. Access itself sits on
// slides-sync.devdogsuga.org, but the Worker checks its token on every
// request too, so the deck stays private if the Access application is
// missing, misconfigured, or not set up yet: with ACCESS_TEAM_DOMAIN or
// ACCESS_AUD unset, everything but `/follow` is refused.
//
// `pnpm run dev:worker` skips the check by passing ACCESS_LOCAL_DEV with
// `--var` (wrangler dev rewrites every request to the routed hostname, so
// the request itself can't say it's local). It's never in wrangler.jsonc or
// set as a secret.
import { createRemoteJWKSet, jwtVerify } from 'jose'

let keys: { team: string, set: ReturnType<typeof createRemoteJWKSet> } | undefined

function keysFor(team: string) {
  if (keys?.team !== team) {
    keys = { team, set: createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`)) }
  }
  return keys.set
}

// undefined when the request may go on, otherwise the response refusing it.
export async function checkAccess(request: Request, env: Env): Promise<Response | undefined> {
  if (env.ACCESS_LOCAL_DEV === 'true') return undefined

  const team = env.ACCESS_TEAM_DOMAIN
  const aud = env.ACCESS_AUD
  if (!team || !aud) {
    return new Response('Cloudflare Access is not configured for this Worker (ACCESS_TEAM_DOMAIN, ACCESS_AUD).', { status: 503 })
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) return new Response('Sign in through Cloudflare Access.', { status: 403 })
  try {
    await jwtVerify(token, keysFor(team), { issuer: `https://${team}`, audience: aud })
    return undefined
  }
  catch {
    return new Response('Invalid Cloudflare Access token.', { status: 403 })
  }
}
