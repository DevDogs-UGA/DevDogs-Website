// Dev-server endpoint behind checkpoints (lib/live.ts): on a demo laptop
// started with `pnpm follow <track>`, switches the laptop's workshop clone
// to the checkpoint tag the presenter sent, throwing away whatever was typed
// live, and answers with how it went for the presenter to see.
//
// The laptop's setup comes from the environment (`pnpm follow` sets it):
//   SLIDES_TRACK      web | mobile: which checkpoints are for this laptop
//   SLIDES_DEMO_REPO  path to the workshop clone the demo is typed into
// A dev server without both (a plain `pnpm dev`) skips every checkpoint.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'
import type { Track } from '../lib/discord'
import { CHECKPOINT_REF, type Checkpoint, type CheckpointStatus } from '../lib/liveProtocol'
import { readBody, readEnv, reply } from './snippets'

const run = promisify(execFile)

function stderrOf(e: unknown): string {
  const err = e as { stderr?: string, message?: string }
  return (err.stderr?.trim() || err.message || String(e)).split('\n').slice(-3).join(' ')
}

async function switchTo(repo: string, ref: string): Promise<string> {
  try {
    await run('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `refs/tags/${ref}^{commit}`])
  }
  catch {
    throw new Error(`no tag ${ref} in ${repo} (git fetch --tags?)`)
  }
  await run('git', ['-C', repo, 'switch', '--detach', '--discard-changes', ref])
  return `now at ${ref}`
}

export function checkpoints(envDir: string): Plugin {
  return {
    name: 'dd:checkpoints',
    apply: 'serve',
    configureServer(server) {
      const env = readEnv(envDir)
      const repo = env.SLIDES_DEMO_REPO
      const track = env.SLIDES_TRACK as Track | undefined
      // The last checkpoint run: every open tab asks, only the first runs it.
      let last: { id: string, result: Promise<CheckpointStatus> } | undefined

      server.middlewares.use('/__checkpoint', async (req, res) => {
        if (req.method !== 'POST') return reply(res, 405, 'POST only')
        const origin = req.headers.origin
        if (origin && new URL(origin).host !== req.headers.host) return reply(res, 403, 'cross-origin')

        let checkpoint: Checkpoint
        try {
          checkpoint = JSON.parse(await readBody(req)) as Checkpoint
        }
        catch {
          return reply(res, 400, 'bad checkpoint')
        }
        res.setHeader('Content-Type', 'application/json')
        if (!repo || !track || !Array.isArray(checkpoint.tracks) || !checkpoint.tracks.includes(track)) {
          return res.end(JSON.stringify({ skipped: true }))
        }

        if (last?.id !== checkpoint.id) {
          const { id, ref } = checkpoint
          const result = (async (): Promise<CheckpointStatus> => {
            if (typeof ref !== 'string' || !CHECKPOINT_REF.test(ref)) {
              return { id, ref: String(ref), track, ok: false, message: 'not a demo/* tag' }
            }
            try {
              const message = await switchTo(repo, ref)
              server.config.logger.info(`[checkpoint] ${message}`)
              return { id, ref, track, ok: true, message }
            }
            catch (e) {
              const message = e instanceof Error && !('stderr' in e) ? e.message : stderrOf(e)
              server.config.logger.error(`[checkpoint] ${ref}: ${message}`)
              return { id, ref, track, ok: false, message }
            }
          })()
          last = { id, result }
        }
        res.end(JSON.stringify(await last.result))
      })
    },
  }
}
