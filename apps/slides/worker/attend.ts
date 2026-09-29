// The attendee side of the live relay (role `attend`, liveProtocol.ts): who
// may connect, what they may send, and the counts the presenter sees. Kept
// apart from relay.ts so it can be tested without a Durable Object.
import type { Track } from '../theme/lib/discord'
import { MAX_ATTEND_STEP, type AttendeeTally } from '../theme/lib/liveProtocol'

// An attendee's whole vocabulary is `{"t":"step","step":12}`.
export const MAX_ATTEND_MESSAGE = 128

// More sockets than this and new attendees are turned away (a club room is
// well under it).
export const MAX_ATTENDEES = 500

// A step changes a few times an hour; this only stops a runaway client.
export const RATE_WINDOW_MS = 10_000
export const RATE_LIMIT = 10
// A socket this far over the limit in one window is closed.
export const FLOOD_LIMIT = 3 * RATE_LIMIT

export function isTrack(value: unknown): value is Track {
  return value === 'web' || value === 'mobile'
}

// undefined when the request may become an attendee socket, else the
// response refusing it. The extension is not a browser and sends no Origin
// header, so a page on some other site can't be made to connect.
export function checkAttendRequest(request: Request): Response | undefined {
  if (request.method !== 'GET') return new Response('GET only', { status: 405 })
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 })
  if (request.headers.has('Origin')) return new Response('browsers may not attend', { status: 403 })
  if (!isTrack(new URL(request.url).searchParams.get('track'))) {
    return new Response('track must be web or mobile', { status: 400 })
  }
  return undefined
}

// The step number in an attendee's message, or undefined for anything else:
// wrong size or type, bad JSON, extra keys, a non-integer or out-of-range step.
export function parseAttendStep(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.length > MAX_ATTEND_MESSAGE) return undefined
  let message: unknown
  try {
    message = JSON.parse(raw)
  }
  catch {
    return undefined
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return undefined
  const { t, step, ...extra } = message as Record<string, unknown>
  if (t !== 'step' || Object.keys(extra).length) return undefined
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > MAX_ATTEND_STEP) return undefined
  return step
}

// What a socket remembers about its own message rate (in its attachment, so
// it survives hibernation).
export interface RateState {
  windowStart?: number
  count?: number
}

// Whether a message at `now` is within the limit, and the state to keep.
export function checkRate(state: RateState, now: number): { ok: boolean, state: RateState } {
  const fresh = state.windowStart === undefined || now - state.windowStart >= RATE_WINDOW_MS
  const windowStart = fresh ? now : state.windowStart
  const count = (fresh ? 0 : state.count ?? 0) + 1
  return { ok: count <= RATE_LIMIT, state: { windowStart, count } }
}

// Counts for the presenter view. `step` is undefined until the attendee has
// reported one.
export function tallyAttendees(attendees: { track?: Track, step?: number }[]): Record<Track, AttendeeTally> {
  const tally: Record<Track, AttendeeTally> = {
    web: { total: 0, steps: {} },
    mobile: { total: 0, steps: {} },
  }
  for (const { track, step } of attendees) {
    if (!track) continue
    tally[track].total++
    if (step !== undefined) tally[track].steps[step] = (tally[track].steps[step] ?? 0) + 1
  }
  return tally
}
