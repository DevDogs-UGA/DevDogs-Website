// The hosted deck at slides-sync.devdogsuga.org: the built slides (static
// assets), the live relay's websockets, and the Discord endpoint behind the
// presenter view's post buttons. See LAYOUTS.md, "Presenting".
//
//   /follow   websocket, public: any deck following the presenter (the demo
//             laptops' local decks connect here from localhost)
//   /drive    websocket, Access: the hosted presenter view
//   /discord  POST, Access: post a snippet to its track's channel
//   *         Access: the deck itself
import { checkAccess } from './access'
import { Relay } from './relay'
import { parseSnippet, sendSnippet, tracksOf, type Track } from '../theme/lib/discord'
import type { Role } from '../theme/lib/liveProtocol'

export { Relay }

function relay(request: Request, env: Env, role: Role): Promise<Response> {
  // The role header is ours alone: the relay trusts it.
  const headers = new Headers(request.headers)
  headers.set('X-Relay-Role', role)
  const stub = env.RELAY.get(env.RELAY.idFromName('live'))
  return stub.fetch(new Request(request, { headers }))
}

async function discord(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('POST only', { status: 405 })
  // Only the deck's own pages post, not some other site the presenter has open.
  const origin = request.headers.get('Origin')
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response('cross-origin', { status: 403 })
  }
  let snippet
  try {
    snippet = parseSnippet(await request.text())
  }
  catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 400 })
  }
  const hooks: Record<Track, string | undefined> = {
    web: env.DISCORD_SNIPPETS_WEBHOOK_WEB,
    mobile: env.DISCORD_SNIPPETS_WEBHOOK_MOBILE,
  }
  const tracks = tracksOf(snippet)
  const missing = tracks.filter(t => !hooks[t])
  if (missing.length) {
    return new Response(`set the Worker secret(s) ${missing.map(t => `DISCORD_SNIPPETS_WEBHOOK_${t.toUpperCase()}`).join(' and ')}`, { status: 503 })
  }
  // One post per distinct URL, in case both tracks share a channel.
  const urls = [...new Set(tracks.map(t => hooks[t]!))]
  try {
    await Promise.all(urls.map(url => sendSnippet(url, snippet)))
  }
  catch (e) {
    console.error('[discord]', e)
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 })
  }
  return new Response(`posted to ${urls.length} channel(s)`)
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/follow') return relay(request, env, 'follow')

    const refused = await checkAccess(request, env)
    if (refused) return refused

    if (pathname === '/drive') return relay(request, env, 'drive')
    if (pathname === '/discord') return discord(request, env)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
