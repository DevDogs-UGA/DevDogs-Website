#!/usr/bin/env node
// `pnpm present` — start the Slidev dev server locked to presenter control
// (`--remote`) and a named Cloudflare Tunnel together, so the two follower
// laptops can watch over the network. See apps/slides/LAYOUTS.md ("Presenting
// across two laptops") for one-time setup (tunnel + Cloudflare Access) and
// the manual-advance fallback if any of this fails on the night.
//
// This is a plain Node script, not TypeScript: it runs directly under
// `node`, outside Vite's transform pipeline, so it can't import
// theme/vite/snippets.ts's `readEnv`. `readEnvFile` below is the same
// KEY="value" .env parser, kept in sync by hand — it's small enough that a
// build step to share it isn't worth it.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(scriptDir, '..') // apps/slides

const LAYOUTS_DOC = 'apps/slides/LAYOUTS.md, "Presenting across two laptops"'

// KEY="value" lines from apps/slides/.env, if it exists. Real environment
// variables win. Mirrors theme/vite/snippets.ts's readEnv.
function readEnvFile(envDir) {
  const file = join(envDir, '.env')
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
  console.error(`\npresent: ${message}\n`)
  console.error(`See ${LAYOUTS_DOC} for setup steps.\n`)
  process.exit(1)
}

async function tunnelIsConfigured(tunnelName) {
  try {
    await execFileAsync('cloudflared', ['tunnel', 'info', tunnelName])
    return true
  }
  catch (e) {
    if (e && e.code === 'ENOENT') {
      fail('cloudflared is not installed (or not on PATH). Install it first.')
    }
    return false
  }
}

async function main() {
  const env = readEnvFile(appDir)

  const password = env.SLIDES_PRESENTER_PASSWORD
  if (!password) {
    fail('SLIDES_PRESENTER_PASSWORD is not set. Add it to apps/slides/.env.')
  }

  const tunnelName = env.SLIDES_TUNNEL_NAME || 'devdogs-slides'
  const tunnelHostname = env.SLIDES_TUNNEL_HOSTNAME || 'slides.devdogsuga.org'

  if (!(await tunnelIsConfigured(tunnelName))) {
    fail(
      `named tunnel "${tunnelName}" isn't set up (\`cloudflared tunnel info ${tunnelName}\` failed). `
      + 'Run `cloudflared tunnel login`, `cloudflared tunnel create '
      + `${tunnelName}\`, and \`cloudflared tunnel route dns ${tunnelName} ${tunnelHostname}\` first.`,
    )
  }

  const port = 3030

  // Bound to loopback: only cloudflared (running on this same machine) needs
  // to reach it. The tunnel is what actually exposes it to the network.
  const slidev = spawn(
    'pnpm',
    ['exec', 'slidev', 'decks/2026-09-28-supabase.md', '--remote', password, '--bind', '127.0.0.1', '--port', String(port)],
    { cwd: appDir, stdio: 'inherit' },
  )

  const tunnel = spawn(
    'cloudflared',
    ['tunnel', 'run', '--url', `http://localhost:${port}`, tunnelName],
    { stdio: 'inherit' },
  )

  let shuttingDown = false
  let exitCode = 0

  function stopBoth(signal) {
    if (shuttingDown) return
    shuttingDown = true
    slidev.kill(signal || 'SIGTERM')
    tunnel.kill(signal || 'SIGTERM')
  }

  function onChildExit(name, code) {
    if (shuttingDown) return
    console.error(`\npresent: ${name} exited (code ${code}) — stopping the other process.\n`)
    exitCode = code || 1
    stopBoth()
  }

  // Register exactly one 'exit' listener per child, right away — a
  // ChildProcess only ever emits 'exit' once, so a listener attached later
  // (e.g. in a Promise.all built after some other await) can silently miss
  // an already-fired event. These two promises are the single source of
  // truth for "has this child exited yet" for the rest of the script.
  const slidevExited = new Promise(resolve => slidev.on('exit', code => resolve(code))).then((code) => {
    onChildExit('slidev', code)
    return code
  })
  const tunnelExited = new Promise(resolve => tunnel.on('exit', code => resolve(code))).then((code) => {
    onChildExit('cloudflared', code)
    return code
  })

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log('\npresent: shutting down...\n')
      stopBoth(signal)
    })
  }

  console.log('\npresent: URLs (share the follower links, keep the presenter link private)\n')
  console.log(`  presenter (this laptop only): https://${tunnelHostname}/presenter/?password=<SLIDES_PRESENTER_PASSWORD>`)
  console.log(`  web follower:                 https://${tunnelHostname}/?track=web`)
  console.log(`  mobile follower:              https://${tunnelHostname}/?track=mobile\n`)

  await Promise.all([slidevExited, tunnelExited])

  process.exit(exitCode)
}

main()
