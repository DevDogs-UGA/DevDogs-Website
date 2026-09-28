// The live relay: one Durable Object that every deck's websocket connects
// to. It keeps the latest slide state (so a deck that joins or reconnects
// lands on the current slide), fans the presenter's state and checkpoints out
// to the followers, and passes the followers' checkpoint results back to the
// presenter. See theme/lib/liveProtocol.ts for the messages.
//
// The Worker in front (index.ts) decides each socket's role, after checking
// Cloudflare Access for `drive`, and passes it in the `X-Relay-Role` header.
// Uses the hibernation API, so an idle relay costs nothing between talks.
import { DurableObject } from 'cloudflare:workers'
import {
  CHECKPOINT_REF,
  type DriveMessage,
  type FollowMessage,
  type RelayMessage,
  type Role,
} from '../theme/lib/liveProtocol'
import type { Track } from '../theme/lib/discord'

interface Attachment {
  role: Role
  track?: Track
}

// Slide state is a handful of numbers; anything this big is not from the deck.
const MAX_MESSAGE = 64 * 1024

const STATE_KEY = 'state'

function isTrack(value: unknown): value is Track {
  return value === 'web' || value === 'mobile'
}

export class Relay extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 })
    }
    const role = request.headers.get('X-Relay-Role') as Role
    const track = new URL(request.url).searchParams.get('track')
    const attachment: Attachment = { role, track: isTrack(track) ? track : undefined }

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server, [role])
    server.serializeAttachment(attachment)

    const state = this.ctx.storage.kv.get(STATE_KEY)
    if (state) this.send(server, { t: 'state', state: state as Record<string, unknown> })
    this.announcePeers()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return
    let message: DriveMessage | FollowMessage
    try {
      message = JSON.parse(raw)
    }
    catch {
      return
    }
    const { role } = ws.deserializeAttachment() as Attachment

    if (role === 'drive' && message.t === 'state' && message.state && typeof message.state === 'object') {
      this.ctx.storage.kv.put(STATE_KEY, message.state)
      this.broadcast({ t: 'state', state: message.state }, ws)
    }
    else if (role === 'drive' && message.t === 'checkpoint') {
      const tracks = Array.isArray(message.tracks) ? message.tracks.filter(isTrack) : []
      if (typeof message.ref !== 'string' || !CHECKPOINT_REF.test(message.ref) || !tracks.length) return
      this.broadcast({ t: 'checkpoint', id: crypto.randomUUID(), ref: message.ref, tracks }, undefined, 'follow')
    }
    else if (role === 'follow' && message.t === 'status' && isTrack(message.track)) {
      const { id, ref, track, ok, message: text } = message
      this.broadcast({
        t: 'status',
        id: String(id),
        ref: String(ref),
        track,
        ok: ok === true,
        message: String(text).slice(0, 500),
      }, undefined, 'drive')
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    // Code 1005 ("no status") can't be sent back.
    ws.close(code === 1005 ? 1000 : code, 'closing')
    this.announcePeers(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.announcePeers(ws)
  }

  // How many follower decks are connected, by track, so the presenter can
  // see both laptops are there before relying on them.
  private announcePeers(leaving?: WebSocket) {
    const peers = { t: 'peers' as const, web: 0, mobile: 0, other: 0 }
    for (const ws of this.ctx.getWebSockets('follow')) {
      if (ws === leaving) continue
      const { track } = ws.deserializeAttachment() as Attachment
      peers[track ?? 'other']++
    }
    this.broadcast(peers, leaving, 'drive')
  }

  private broadcast(message: RelayMessage, except?: WebSocket, role?: Role) {
    for (const ws of this.ctx.getWebSockets(role)) {
      if (ws !== except) this.send(ws, message)
    }
  }

  private send(ws: WebSocket, message: RelayMessage) {
    try {
      ws.send(JSON.stringify(message))
    }
    catch {
      // Already closing; webSocketClose tidies up.
    }
  }
}
