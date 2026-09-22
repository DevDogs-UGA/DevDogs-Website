// DevDogs accent system — shared by every layout and the Accent/Chip components.
// Ported 1:1 from the PPTX deck template (see memory: devdogs-deck-template).
export const ACCENTS = {
  purple: '#C27AFF',
  cyan: '#00D3F2',
  amber: '#FFB900',
  emerald: '#00D492',
  red: '#FF6467',
} as const

export type AccentName = keyof typeof ACCENTS

export const DEFAULT_ACCENT: AccentName = 'emerald'

export function accentHex(name?: string | null): string {
  if (name && Object.prototype.hasOwnProperty.call(ACCENTS, name))
    return ACCENTS[name as AccentName]
  return ACCENTS[DEFAULT_ACCENT]
}
