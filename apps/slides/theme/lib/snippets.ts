// Posting a slide's code to Discord during the presentation.
//
// The presenter view shows a Discord button beside each code block's copy
// button (and `p` posts every block on the current slide). The browser never
// sees a webhook URL: it POSTs the snippet to the Slidev dev server's
// `/__snippets` endpoint (vite/snippets.ts), which picks the channel by track
// and forwards it to Discord. The static build has no such endpoint, so
// nothing here renders outside `slidev` dev mode.
//
// What gets posted is the block's *focus*: the span covering every line its
// highlight ranges name (the surrounding context lines, dimmed on the slide,
// stay behind), with the file path and real line numbers as a header.
import { inject, provide, type InjectionKey } from 'vue'
import type { TrackName } from './track'

export interface SnippetScope {
  // Which channel: 'web' → DogDays, 'mobile' → DogPack, unset → both.
  track?: TrackName
  file?: string
}

const SCOPE: InjectionKey<SnippetScope> = Symbol('dd-snippet-scope')

// Layouts wrap each code area in <SnippetScope> (dual-code: one per column;
// terminal: the whole window), and <Track> adds its track, so the code blocks
// inside know where they post. A nested scope inherits what it leaves unset.
export function provideSnippetScope(scope: SnippetScope) {
  const parent = inject(SCOPE, {})
  provide(SCOPE, {
    get track() { return scope.track ?? parent.track },
    get file() { return scope.file ?? parent.file },
  })
}

export function useSnippetScope(): SnippetScope {
  return inject(SCOPE, {})
}

export interface Snippet {
  code: string
  lang?: string
  file?: string
  startLine?: number
  endLine?: number
  track?: TrackName
}

// Every line a list of Slidev highlight ranges ('1,3-5', 'all', 'hide', ...)
// names, or undefined when any of them means "the whole block".
function namedLines(ranges: string[]): number[] | undefined {
  const lines = new Set<number>()
  for (const range of ranges) {
    const r = range.trim()
    if (!r || r === 'all' || r === '*') return undefined
    if (r === 'hide' || r === 'none') continue
    for (const part of r.split(',')) {
      const [from, to = from] = part.split('-').map(Number)
      if (Number.isNaN(from) || Number.isNaN(to)) return undefined
      for (let n = from; n <= to; n++) lines.add(n)
    }
  }
  return lines.size ? [...lines] : undefined
}

// The focus of a block whose first line is `startLine` in its file. A
// contiguous span, so gaps inside it (a blank line, a closing brace between
// two highlighted groups) come along and the pasted code still parses.
export function focusOf(code: string, startLine: number, ranges: string[]) {
  const lines = code.replace(/\n+$/, '').split('\n')
  const last = startLine + lines.length - 1
  const named = namedLines(ranges)?.filter(n => n >= startLine && n <= last)
  const from = named?.length ? Math.min(...named) : startLine
  const to = named?.length ? Math.max(...named) : last
  return {
    code: lines.slice(from - startLine, to - startLine + 1).join('\n'),
    startLine: from,
    endLine: to,
  }
}

export const canPost = import.meta.env.DEV

export async function postSnippet(snippet: Snippet): Promise<void> {
  const res = await fetch('/__snippets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snippet),
  })
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
}

// Code blocks mounted in the presenter view register here by slide number,
// so the `p` shortcut can post everything on the current slide.
const registry = new Map<number, Set<() => Promise<void>>>()

export function registerSnippet(page: number, post: () => Promise<void>): () => void {
  let set = registry.get(page)
  if (!set) registry.set(page, set = new Set())
  set.add(post)
  return () => set.delete(post)
}

export async function postPage(page: number): Promise<number> {
  const posts = [...(registry.get(page) ?? [])]
  await Promise.all(posts.map(post => post()))
  return posts.length
}
