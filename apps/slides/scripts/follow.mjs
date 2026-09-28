#!/usr/bin/env node
// `pnpm follow <web|mobile> [path/to/workshop-clone]`: run this deck on a
// demo laptop, following the hosted presenter view through the live relay
// and taking its checkpoints (LAYOUTS.md, "Presenting"). Starts the Slidev
// dev server with the laptop's setup in its environment:
//
//   SLIDES_TRACK      the track given here
//   SLIDES_DEMO_REPO  the clone given here, else SLIDES_DEMO_REPO from .env
//   SLIDES_LIVE_URL   from .env, else https://slides-relay.devdogsuga.org
//
// Plain Node, not TypeScript, so it runs without Vite. The .env parser
// matches theme/vite/snippets.ts's readEnv.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const DECK = 'decks/2026-09-28-supabase.md'
const PORT = 3030

// Every `checkpoint:` in the deck's frontmatter, in slide order (following
// the deck's `src:` imports), without repeats.
function deckCheckpoints() {
  const seen = new Set()
  function walk(file) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const src = line.match(/^src:\s*(\S+)\s*$/)
      if (src) walk(join(dirname(file), src[1]))
      const checkpoint = line.match(/^checkpoint:\s*(\S+)\s*$/)
      if (checkpoint) seen.add(checkpoint[1])
    }
  }
  walk(join(appDir, DECK))
  return [...seen]
}

function readEnvFile() {
  const file = join(appDir, '.env')
  const vars = {}
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { ...vars, ...process.env }
}

function fail(message) {
  console.error(`\nfollow: ${message}\n\nUsage: pnpm follow <web|mobile> [path/to/workshop-clone]\n`)
  process.exit(1)
}

const [track, repoArg] = process.argv.slice(2)
if (track !== 'web' && track !== 'mobile') fail('name the track: web or mobile.')

const env = readEnvFile()
const repo = repoArg ? resolve(process.env.INIT_CWD ?? process.cwd(), repoArg) : env.SLIDES_DEMO_REPO
if (!repo) fail('give the workshop clone the demo is typed into, or set SLIDES_DEMO_REPO in apps/slides/.env.')

let tags = []
try {
  execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { stdio: 'ignore' })
  tags = execFileSync('git', ['-C', repo, 'tag', '--list', 'demo/*'], { encoding: 'utf8' }).split('\n').filter(Boolean)
}
catch {
  fail(`${repo} is not a git repository.`)
}

const live = env.SLIDES_LIVE_URL || 'https://slides-relay.devdogsuga.org'

console.log(`\nfollow: ${track} laptop, following ${live}`)
console.log(`  workshop clone: ${repo}`)
const checkpoints = deckCheckpoints()
const missing = checkpoints.filter(tag => !tags.includes(tag))
console.log('\n  checkpoints in the deck:')
for (const tag of checkpoints) console.log(`    ${tags.includes(tag) ? '✓' : '✗'} ${tag}`)
if (missing.length) console.log(`\n  ✗ ${missing.length} missing from the clone (git fetch --tags?); those checkpoints will fail.`)
console.log(`\n  open http://localhost:${PORT}/ on this laptop's projector\n`)

const slidev = spawn(
  'pnpm',
  ['exec', 'slidev', DECK, '--port', String(PORT)],
  {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, SLIDES_TRACK: track, SLIDES_DEMO_REPO: repo, SLIDES_LIVE_URL: live },
  },
)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => slidev.kill(signal))
slidev.on('exit', code => process.exit(code ?? 0))
