// The deck's end of the live relay (worker/relay.ts, messages in
// liveProtocol.ts): one websocket per page.
//
// Where it connects:
//   - The hosted deck (slides-sync.devdogsuga.org) connects to its own
//     origin. Its presenter view drives (`/drive`, behind Cloudflare Access);
//     any other page there follows.
//   - A local deck started with `pnpm follow` (a demo laptop) follows the
//     relay named by SLIDES_LIVE_URL, and runs checkpoints against its own
//     workshop clone through the dev server (vite/checkpoint.ts).
//   - A plain `pnpm dev` deck connects to nothing.
//
// Slide state rides Slidev's own sync (setup/root.ts registers the relay as
// a sync method); this module owns the socket, checkpoints, and who's
// connected.
import { reactive, ref } from 'vue'
import type { Track } from './discord'
import type {
  Checkpoint,
  CheckpointStatus,
  DriveMessage,
  FollowMessage,
  RelayMessage,
  Role,
  SharedState,
} from './liveProtocol'
import { track as pageTrack } from './track'

// Set by theme/vite.config.ts from the dev server's environment.
declare const __DD_LIVE_URL__: string
declare const __DD_TRACK__: string

// The relay's origin, or null for a deck that doesn't use one.
function relayOrigin(): string | null {
  if (typeof window === 'undefined') return null
  if (!import.meta.env.DEV) return window.location.origin
  return __DD_LIVE_URL__ || null
}

export const liveEnabled = relayOrigin() !== null

// This laptop's track as a demo laptop (`pnpm follow web`), else the page's.
const laptopTrack = (__DD_TRACK__ || undefined) as Track | undefined

export const connection = ref<'off' | 'connecting' | 'open' | 'closed'>('off')
export const currentRole = ref<Role>()
export const peers = ref({ web: 0, mobile: 0, other: 0 })
// The latest checkpoint the presenter sent, and each laptop's answer.
export const lastCheckpoint = ref<{ ref: string, tracks: Track[], sentAt: number }>()
export const checkpointResults = reactive(new Map<Track, CheckpointStatus>())

let socket: WebSocket | undefined
let retry: ReturnType<typeof setTimeout> | undefined
let attempts = 0
let latestState: SharedState | undefined
const stateListeners = new Set<(state: SharedState) => void>()

function send(message: DriveMessage | FollowMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

// (Re)connect as `role`. Called whenever the page becomes or stops being the
// presenter view.
export function connect(role: Role) {
  const origin = relayOrigin()
  if (!origin || (currentRole.value === role && socket)) return
  currentRole.value = role
  clearTimeout(retry)
  if (socket) {
    socket.onclose = null
    socket.close()
  }
  const url = new URL(role === 'drive' ? '/drive' : '/follow', origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const track = laptopTrack ?? pageTrack.value
  if (role === 'follow' && track) url.searchParams.set('track', track)

  connection.value = 'connecting'
  const ws = new WebSocket(url)
  socket = ws
  ws.onopen = () => {
    attempts = 0
    connection.value = 'open'
    // The presenter's slide wins over whatever the relay remembered.
    if (role === 'drive' && latestState) send({ t: 'state', state: latestState })
  }
  ws.onmessage = event => receive(role, JSON.parse(String(event.data)) as RelayMessage)
  ws.onclose = () => {
    if (socket !== ws) return
    socket = undefined
    connection.value = 'closed'
    // Back off to a retry every 10s; the venue's wifi will come back.
    retry = setTimeout(() => connect(role), Math.min(10_000, 500 * 2 ** attempts++))
  }
}

function receive(role: Role, message: RelayMessage) {
  switch (message.t) {
    case 'state':
      // The presenter view is the source of the state, never a receiver.
      if (role === 'follow') stateListeners.forEach(fn => fn(message.state))
      break
    case 'checkpoint':
      if (import.meta.env.DEV) void runCheckpoint(message)
      break
    case 'status':
      checkpointResults.set(message.track, message)
      break
    case 'peers':
      peers.value = { web: message.web, mobile: message.mobile, other: message.other }
      break
  }
}

// Slide state from the presenter, for the Slidev sync method.
export function onRelayState(fn: (state: SharedState) => void) {
  stateListeners.add(fn)
}

// The presenter view's slide state, from the Slidev sync method.
export function sendState(state: SharedState) {
  latestState = state
  if (currentRole.value === 'drive') send({ t: 'state', state })
}

// Presenter view: switch the named laptops to a checkpoint tag.
export function sendCheckpoint(ref: string, tracks: Track[]) {
  for (const track of tracks) checkpointResults.delete(track)
  lastCheckpoint.value = { ref, tracks, sentAt: Date.now() }
  send({ t: 'checkpoint', ref, tracks })
}

// Demo laptop: have the dev server switch this laptop's workshop clone, and
// report back. Every open tab gets the checkpoint; the dev server runs each
// one once and answers the rest from that run.
async function runCheckpoint(checkpoint: Checkpoint) {
  let status: CheckpointStatus | { skipped: true }
  try {
    const res = await fetch('/__checkpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkpoint),
    })
    status = await res.json()
  }
  catch (e) {
    if (!laptopTrack) return
    status = { ...checkpoint, track: laptopTrack, ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  if ('skipped' in status) return
  send({ t: 'status', ...status })
}
