// Messages on the live relay (worker/relay.ts): the websocket that keeps the
// hosted presenter view and the demo laptops' local decks on the same slide,
// and carries checkpoints. Shared by the Worker and the deck (lib/live.ts).
//
// Two kinds of socket. `drive` (the hosted presenter view, behind Cloudflare
// Access) sends the slide state and checkpoints. `follow` (every other deck,
// including the demo laptops' local ones) receives them and can only answer
// a checkpoint with its outcome.
import type { Track } from './discord'

export type Role = 'drive' | 'follow'

// A checkpoint is a tag in the demo laptops' workshop clones, e.g.
// `demo/03-insert-naive`. Anything else is refused at the relay and again on
// the laptop, since the laptop runs `git switch` on it.
export const CHECKPOINT_REF = /^demo\/[\w.-]+$/

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

export type RelayMessage =
  | { t: 'state', state: SharedState }
  // To followers.
  | ({ t: 'checkpoint' } & Checkpoint)
  // To drivers.
  | ({ t: 'status' } & CheckpointStatus)
  | { t: 'peers', web: number, mobile: number, other: number }
