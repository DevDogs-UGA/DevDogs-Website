// Messages on the live relay (worker/relay.ts): the websocket that keeps the
// hosted presenter view and the demo laptops' local decks on the same slide,
// and carries checkpoints. Shared by the Worker and the deck (lib/live.ts).
//
// Three kinds of socket. `drive` (the hosted presenter view, behind Cloudflare
// Access) sends the slide state and checkpoints. `follow` (every other deck,
// including the demo laptops' local ones) receives them and can only answer
// a checkpoint with its outcome. `attend` (an attendee's VS Code extension,
// public like `follow`, one track per socket) receives only the checkpoints
// for its track and whether a presenter is connected, and may send back one
// thing: the anonymous number of the step it has reached.
import type { Track } from './discord'

export type Role = 'drive' | 'follow' | 'attend'

// Workshops have well under this many steps; anything bigger is not from
// the extension.
export const MAX_ATTEND_STEP = 99

// The step number in a checkpoint ref: 3 for `02-supabase/03-insert-naive`.
export function checkpointStep(ref: string): number | undefined {
  const match = /\/(\d\d)-/.exec(ref)
  return match ? Number(match[1]) : undefined
}

// A checkpoint is a step tag in the workshop repos, `<workshop>/<NN>-<slug>`,
// e.g. `02-supabase/03-insert-naive` (scripts/tag-steps.ts). Anything else is
// refused at the relay and again on the laptop, since the laptop runs
// `git switch` on it.
export const CHECKPOINT_REF = /^[\w.-]+\/\d\d-[\w.-]+$/

export interface Checkpoint {
  id: string
  ref: string
  tracks: Track[]
}

export interface CheckpointStatus {
  id: string
  ref: string
  track: Track
  ok: boolean
  message: string
}

// Slidev's shared nav state (page, clicks, timer, cursor, ...), passed
// through untouched.
export type SharedState = Record<string, unknown>

export type DriveMessage =
  | { t: 'state', state: SharedState }
  | { t: 'checkpoint', ref: string, tracks: Track[] }

export type FollowMessage = { t: 'status' } & CheckpointStatus

// The only thing an attendee may send: the step number it has reached (0:
// none yet). No names, no code.
export type AttendMessage = { t: 'step', step: number }

// How many attendees are connected on a track, and how many are at each step
// (keyed by step number).
export interface AttendeeTally {
  total: number
  steps: Record<string, number>
}

export type RelayMessage =
  | { t: 'state', state: SharedState }
  // To followers and, for their own track, attendees.
  | ({ t: 'checkpoint' } & Checkpoint)
  // To drivers.
  | ({ t: 'status' } & CheckpointStatus)
  | { t: 'peers', web: number, mobile: number, other: number, attend: Record<Track, AttendeeTally> }
  // To attendees: whether a presenter is connected. Sent on connect and
  // whenever it changes.
  | { t: 'live', live: boolean }
