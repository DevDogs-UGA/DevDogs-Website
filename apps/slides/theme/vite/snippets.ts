// Dev-server endpoint behind the deck's "post to Discord" buttons (see
// lib/snippets.ts). The browser POSTs a snippet to `/__snippets`; this
// forwards it to the Discord webhook for its track, so webhook URLs stay on
// the presenting machine and never reach the client bundle.
//
// Webhook URLs come from apps/slides/.env (gitignored; see .env.example):
//   DISCORD_SNIPPETS_WEBHOOK_WEB     DogDays (Next.js) channel
//   DISCORD_SNIPPETS_WEBHOOK_MOBILE  DogPack (Flutter) channel
// A snippet with no track (the SQL, shared by both stacks) goes to both.
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
// Type-only: `vite` isn't a direct dependency of this app (it arrives
// through @slidev/cli), so nothing here may import it at runtime.
import type { Plugin } from 'vite'

type Track = 'web' | 'mobile'

interface Snippet {
  code: string
  lang?: string
  file?: string
  startLine?: number
  endLine?: number
  track?: Track
}

const ENV_KEYS: Record<Track, string> = {
  web: 'DISCORD_SNIPPETS_WEBHOOK_WEB',
  mobile: 'DISCORD_SNIPPETS_WEBHOOK_MOBILE',
}

// Discord's message limit is 2000 characters; past this the code goes up as
// a file attachment instead, which Discord previews and lets people download.
const MAX_INLINE = 1900

// KEY="value" lines from apps/slides/.env, if it exists. Real environment
// variables win. Exported so theme/vite.config.ts can read the same .env
// (for SLIDES_TUNNEL_HOSTNAME) without re-parsing it. scripts/present.mjs
// needs its own copy of this parser instead — it runs directly under `node`,
// outside Vite's transform pipeline, so it can't import a .ts file here.
export function readEnv(envDir: string): Record<string, string | undefined> {
  const file = join(envDir, '.env')
  const vars: Record<string, string> = {}
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { ...vars, ...process.env }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 1_000_000) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function parse(body: string): Snippet {
  const s = JSON.parse(body) as Partial<Snippet>
  if (typeof s.code !== 'string' || !s.code.trim()) throw new Error('snippet has no code')
  if (s.track !== undefined && s.track !== 'web' && s.track !== 'mobile') throw new Error('bad track')
  return s as Snippet
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

async function send(url: string, s: Snippet): Promise<void> {
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

function reply(res: ServerResponse, status: number, text: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(text)
}

export function snippetsWebhook(envDir: string): Plugin {
  return {
    name: 'dd:snippets-webhook',
    apply: 'serve',
    configureServer(server) {
      const env = readEnv(envDir)

      server.middlewares.use('/__snippets', async (req, res) => {
        if (req.method !== 'POST') return reply(res, 405, 'POST only')

        // Only pages served by this dev server may post, not some other site
        // the presenter has open.
        const origin = req.headers.origin
        if (origin && new URL(origin).host !== req.headers.host) return reply(res, 403, 'cross-origin')

        let snippet: Snippet
        try {
          snippet = parse(await readBody(req))
        }
        catch (e) {
          return reply(res, 400, e instanceof Error ? e.message : String(e))
        }

        const tracks: Track[] = snippet.track ? [snippet.track] : ['web', 'mobile']
        const missing = tracks.filter(t => !env[ENV_KEYS[t]]).map(t => ENV_KEYS[t])
        if (missing.length) return reply(res, 503, `set ${missing.join(' and ')} in apps/slides/.env`)

        // One post per distinct URL, in case both tracks share a channel.
        const urls = [...new Set(tracks.map(t => env[ENV_KEYS[t]]!))]
        try {
          await Promise.all(urls.map(url => send(url, snippet)))
        }
        catch (e) {
          server.config.logger.error(`[snippets] ${e instanceof Error ? e.message : String(e)}`)
          return reply(res, 502, e instanceof Error ? e.message : String(e))
        }
        reply(res, 200, `posted to ${urls.length} channel(s)`)
      })
    },
  }
}
