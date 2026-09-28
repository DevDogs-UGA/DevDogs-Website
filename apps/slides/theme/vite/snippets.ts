// Dev-server endpoint behind the deck's "post to Discord" buttons (see
// lib/snippets.ts), for trying them out locally. The hosted deck posts
// through its Worker instead (worker/index.ts). The browser POSTs a snippet
// to `/__snippets`; this forwards it to the Discord webhook for its track
// (lib/discord.ts), so webhook URLs stay on this machine and never reach the
// client bundle.
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
import { parseSnippet, sendSnippet, tracksOf, type Snippet, type Track } from '../lib/discord'

const ENV_KEYS: Record<Track, string> = {
  web: 'DISCORD_SNIPPETS_WEBHOOK_WEB',
  mobile: 'DISCORD_SNIPPETS_WEBHOOK_MOBILE',
}

// KEY="value" lines from apps/slides/.env, if it exists. Real environment
// variables win. Exported so theme/vite.config.ts and the other dev-server
// plugins read the same .env.
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

export function readBody(req: IncomingMessage): Promise<string> {
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

export function reply(res: ServerResponse, status: number, text: string) {
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
          snippet = parseSnippet(await readBody(req))
        }
        catch (e) {
          return reply(res, 400, e instanceof Error ? e.message : String(e))
        }

        const tracks = tracksOf(snippet)
        const missing = tracks.filter(t => !env[ENV_KEYS[t]]).map(t => ENV_KEYS[t])
        if (missing.length) return reply(res, 503, `set ${missing.join(' and ')} in apps/slides/.env`)

        // One post per distinct URL, in case both tracks share a channel.
        const urls = [...new Set(tracks.map(t => env[ENV_KEYS[t]]!))]
        try {
          await Promise.all(urls.map(url => sendSnippet(url, snippet)))
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
