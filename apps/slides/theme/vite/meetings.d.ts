// Type for the virtual module `theme/vite/meetings.ts` exposes at build/dev
// time. Declared separately from that file (which only runs in Node, during
// Vite's own config/plugin phase) so `UpcomingStack.vue`'s client-side
// import of `virtual:dd-meetings` type-checks.
declare module 'virtual:dd-meetings' {
  import type { DeckMeeting } from './meetings'

  export const meetings: DeckMeeting[]
}
