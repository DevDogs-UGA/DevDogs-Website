// Posting a code snippet to a Discord webhook. Shared by the dev server's
// `/__snippets` endpoint (vite/snippets.ts) and the hosted deck's Worker
// (worker/index.ts), so both post the same message. Plain `fetch`, no Node
// or Workers APIs, so it runs in either.
export type Track = 'web' | 'mobile'

export interface Snippet {
  code: string
  lang?: string
  file?: string
  startLine?: number
  endLine?: number
  track?: Track
}

// Discord's message limit is 2000 characters; past this the code goes up as
// a file attachment instead, which Discord previews and lets people download.
const MAX_INLINE = 1900

export function parseSnippet(body: string): Snippet {
  const s = JSON.parse(body) as Partial<Snippet>
  if (typeof s.code !== 'string' || !s.code.trim()) throw new Error('snippet has no code')
  if (s.track !== undefined && s.track !== 'web' && s.track !== 'mobile') throw new Error('bad track')
  return s as Snippet
}

// A snippet with no track (the SQL, shared by both stacks) goes to both.
export function tracksOf(s: Snippet): Track[] {
  return s.track ? [s.track] : ['web', 'mobile']
}

function header(s: Snippet): string {
  if (!s.file) return ''
  const lines = s.startLine && s.endLine
    ? s.startLine === s.endLine ? ` · line ${s.startLine}` : ` · lines ${s.startLine}–${s.endLine}`
    : ''
  return `**\`${s.file}\`**${lines}`
}

function filename(s: Snippet): string {
  const base = s.file?.split('/').pop()
  return base || `snippet.${s.lang || 'txt'}`
}

export async function sendSnippet(url: string, s: Snippet): Promise<void> {
  const head = header(s)
  const fenced = `${head ? `${head}\n` : ''}\`\`\`${s.lang ?? ''}\n${s.code}\n\`\`\``
  const payload = { allowed_mentions: { parse: [] as string[] } }

  let res: Response
  if (fenced.length <= MAX_INLINE) {
    res = await fetch(`${url}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, content: fenced }),
    })
  }
  else {
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ ...payload, content: head || undefined }))
    form.append('files[0]', new Blob([`${s.code}\n`], { type: 'text/plain' }), filename(s))
    res = await fetch(`${url}?wait=true`, { method: 'POST', body: form })
  }
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
