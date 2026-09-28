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
import { existsSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const DECK = 'decks/2026-09-28-supabase.md'
const PORT = 3030

// Where each track's checkpoint tags live (private: needs a GitHub login
// that can read it).
const PLANNING_REPO = {
  web: 'https://github.com/DevDogsUGA/web-workshops-planning.git',
  mobile: 'https://github.com/DevDogsUGA/mobile-workshops-planning.git',
}

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

// The deck imports @devdogsuga/brand and @devdogsuga/events, which resolve
// to their built dist/. A fresh checkout hasn't built them yet.
function buildWorkspaceDeps() {
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
  const unbuilt = Object.entries(pkg.dependencies)
    .filter(([name, range]) => range.startsWith('workspace:')
      && !existsSync(join(appDir, 'node_modules', name, 'dist')))
    .map(([name]) => name)
  if (!unbuilt.length) return
  // tsc is incremental: a .tsbuildinfo left from an earlier build makes it
  // skip emitting a dist/ that has since gone missing.
  for (const name of unbuilt) {
    rmSync(join(realpathSync(join(appDir, 'node_modules', name)), 'tsconfig.tsbuildinfo'), { force: true })
  }
  console.log(`\nfollow: building ${unbuilt.join(', ')} (first run on this checkout)\n`)
  try {
    execFileSync('pnpm', ['--filter', 'slides^...', '--if-present', 'run', 'build'], { cwd: appDir, stdio: 'inherit' })
  }
  catch {
    fail('building the workspace packages failed (see above). Run `pnpm install` at the repo root first.')
  }
}

const env = readEnvFile()
const repo = repoArg ? resolve(process.env.INIT_CWD ?? process.cwd(), repoArg) : env.SLIDES_DEMO_REPO
if (!repo) fail('give the workshop clone the demo is typed into, or set SLIDES_DEMO_REPO in apps/slides/.env.')

try {
  execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { stdio: 'ignore' })
}
catch {
  fail(`${repo} is not a git repository.`)
}

function demoTags() {
  return execFileSync('git', ['-C', repo, 'tag', '--list', 'demo/*'], { encoding: 'utf8' }).split('\n').filter(Boolean)
}

// A clone of the public repo doesn't have the checkpoint tags: fetch the
// missing ones from the planning repo.
const checkpoints = deckCheckpoints()
let tags = demoTags()
if (checkpoints.some(tag => !tags.includes(tag))) {
  console.log(`\nfollow: fetching checkpoint tags from ${PLANNING_REPO[track]}`)
  try {
    execFileSync('git', ['-C', repo, 'fetch', '--no-tags', PLANNING_REPO[track], '+refs/tags/demo/*:refs/tags/demo/*'], { stdio: 'inherit' })
  }
  catch {
    console.log('follow: couldn\'t fetch them; checkpoints without a tag will fail.')
  }
  tags = demoTags()
}

buildWorkspaceDeps()

const live = env.SLIDES_LIVE_URL || 'https://slides-relay.devdogsuga.org'

console.log(`\nfollow: ${track} laptop, following ${live}`)
console.log(`  workshop clone: ${repo}`)
const missing = checkpoints.filter(tag => !tags.includes(tag))
console.log('\n  checkpoints in the deck:')
for (const tag of checkpoints) console.log(`    ${tags.includes(tag) ? '✓' : '✗'} ${tag}`)
if (missing.length) console.log(`\n  ✗ ${missing.length} missing from the clone; those checkpoints will fail.`)
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
