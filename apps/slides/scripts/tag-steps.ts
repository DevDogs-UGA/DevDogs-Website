// Gives each workshop step's tag its title, commands and docs page, so a
// clone of a workshop repo knows its own steps offline (the workshops VS Code
// extension reads them with `git for-each-ref`).
//
//   pnpm tag-steps [--deck decks/<deck>.md] [--web <clone>] [--mobile <clone>]
//   pnpm tag-steps --check [--remote public]
//
// A step tag is `<workshop>/<NN>-<slug>` (e.g. `02-supabase/03-insert-naive`),
// the `checkpoint:` of that step's slides. The author still picks each
// step's commit, by tagging it while building the demo; this script only
// annotates the tag where it stands, and never moves one. The message:
//
//   Read the Guestbook                              ← the step's docs page title
//
//   Run: pnpm add @supabase/supabase-js             ← one per command, in order
//   Docs: /docs/workshops/supabase/nextjs/01-read
//
// The commands are every line of the page's shell blocks for that track,
// bar a block marked `{run: false}` (scripts/deck.ts `pageCommands`).
//
// Each track also gets `<workshop>/00-start` at the branch its demo starts
// from (`docs.tracks.<track>.start`), with the message `Start: <branch>`,
// naming the workshop before it. It's tagged on the first run; after that
// the branch may move on, so it's only checked to still come before step 1.
//
// Decks: every deck with `docs:` in its headmatter, or just `--deck`. Clones:
// the deck's workshop submodules (workshops/web, workshops/mobile), or
// `--web`/`--mobile`. Tags inside a deck's workshop that no slide names are
// reported as stale; tags outside every deck's workshops are left alone.
//
// `--check` changes nothing and fails on any difference. With `--remote
// <name|url>` it also checks the remote's tags (`git ls-remote`) are these
// exact tag objects: same commit, same message. `public` falls back to the
// deck's `docs.repos` repo on GitHub when the clone has no such remote.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { CHECKPOINT_REF } from '../theme/lib/liveProtocol.ts'
import { loadDeck, pageCommands, pageContent, pagesOf, TRACKS, type Deck, type Track } from './deck.ts'

const APP = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({
  options: {
    deck: { type: 'string' },
    web: { type: 'string' },
    mobile: { type: 'string' },
    check: { type: 'boolean', default: false },
    remote: { type: 'string' },
  },
})
if (values.remote && !values.check) throw new Error('--remote only checks: pass --check too')

const clones: Record<Track, string> = {
  web: resolve(values.web ?? join(APP, 'workshops/web')),
  mobile: resolve(values.mobile ?? join(APP, 'workshops/mobile')),
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tryGit(repo: string, args: string[]): string | undefined {
  try {
    return git(repo, args)
  }
  catch {
    return undefined
  }
}

// A deck is one of ours if its headmatter (the first frontmatter block) has
// a `docs` key.
function hasDocs(file: string): boolean {
  const head = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/)
  return Boolean(head && /^docs:/m.test(head[1]))
}

const decks = values.deck
  ? [resolve(APP, values.deck)]
  : readdirSync(join(APP, 'decks')).filter(f => f.endsWith('.md')).map(f => join(APP, 'decks', f)).filter(hasDocs)

interface Wanted {
  name: string
  message: string
  /** For `00-start`, the branch to tag the first time. */
  start?: string
}

// The tags a deck wants in one track's repo, in step order, and the
// workshop they're under.
function wantedTags(deck: Deck, track: Track): { prefix: string, tags: Wanted[] } {
  const where = deck.entry.slice(APP.length)
  const config = deck.docs.tracks?.[track]
  if (!config?.start) throw new Error(`${where}: the headmatter's docs.tracks.${track} names no start branch`)
  if (!deck.docs.url) throw new Error(`${where}: the headmatter's docs has no url (where the pages are on the docs site)`)
  const steps = pagesOf(deck.slides).filter(p => p.checkpoint)
  if (!steps.length) throw new Error(`${where}: no slide has a checkpoint`)

  const prefix = steps[0].checkpoint!.split('/')[0]
  const tags: Wanted[] = [{ name: `${prefix}/00-start`, message: `Start: ${config.start}`, start: config.start }]
  for (const page of steps) {
    const name = page.checkpoint!
    if (!CHECKPOINT_REF.test(name) || !name.startsWith(`${prefix}/`)) {
      throw new Error(`${where}: checkpoint ${name} isn't ${prefix}/<NN>-<slug> like the deck's first`)
    }
    const previous = tags.at(-1)!.name
    if (name.split('/')[1] <= previous.split('/')[1]) {
      throw new Error(`${where}: checkpoint ${name} comes after ${previous}, so its number should be higher`)
    }
    const run = pageCommands(page, track).map(command => `Run: ${command}`)
    const docs = `Docs: ${deck.docs.url}/${config.dir}/${page.start.file}`
    tags.push({ name, message: [pageContent(page, track).title, '', ...run, docs].join('\n') })
  }
  return { prefix, tags }
}

interface Tag {
  /** The tag object, or the commit for a lightweight tag. */
  object: string
  commit: string
  annotated: boolean
  message: string
}

function readTag(repo: string, name: string): Tag | undefined {
  const line = tryGit(repo, ['for-each-ref', '--format=%(objecttype)%00%(objectname)%00%(*objectname)%00%(contents)', `refs/tags/${name}`])
  if (!line) return undefined
  const [type, object, peeled, message] = line.split('\0')
  const annotated = type === 'tag'
  return { object, commit: annotated ? peeled : object, annotated, message: annotated ? message.trim() : '' }
}

function annotate(repo: string, name: string, commit: string, message: string) {
  git(repo, ['tag', '--force', '--annotate', '--cleanup=whitespace', '--message', message, name, commit])
}

function isAncestor(repo: string, a: string, b: string): boolean {
  return tryGit(repo, ['merge-base', '--is-ancestor', a, b]) !== undefined
}

// The remote's tags under a prefix, by name: the tag object each points at.
function remoteTags(repo: string, remote: string, prefix: string): Map<string, string> {
  const tags = new Map<string, string>()
  for (const line of git(repo, ['ls-remote', '--tags', remote, `refs/tags/${prefix}/*`]).split('\n').filter(Boolean)) {
    const [object, ref] = line.split('\t')
    if (!ref.endsWith('^{}')) tags.set(ref.slice('refs/tags/'.length), object)
  }
  return tags
}

function remoteFor(repo: string, deck: Deck, track: Track, remote: string): string {
  if (tryGit(repo, ['remote', 'get-url', remote]) !== undefined) return remote
  const slug = deck.docs.repos?.[track]
  if (remote === 'public' && slug) return `https://github.com/${slug}.git`
  return remote
}

const problems: string[] = []
const changed: string[] = []

for (const entry of decks) {
  const deck = await loadDeck(entry)
  for (const track of Object.keys(TRACKS) as Track[]) {
    const repo = clones[track]
    const { prefix, tags } = wantedTags(deck, track)
    const label = `${track} (${repo})`
    const problem = (text: string) => problems.push(`${label}: ${text}`)
    let previous: { name: string, commit: string } | undefined

    for (const want of tags) {
      let tag = readTag(repo, want.name)
      if (!tag && want.start) {
        const start = tryGit(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${want.start}^{commit}`])
          ?? tryGit(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `origin/${want.start}^{commit}`])
        if (!start) {
          problem(`no ${want.name}, and no ${want.start} branch to tag it at`)
          continue
        }
        if (values.check) {
          problem(`no ${want.name} (would tag ${want.start})`)
          continue
        }
        annotate(repo, want.name, start, want.message)
        changed.push(`${label}: tagged ${want.name} at ${want.start}`)
        tag = readTag(repo, want.name)!
      }
      else if (!tag) {
        problem(`no ${want.name}: tag the step's commit first (git tag ${want.name} <commit>)`)
        continue
      }
      else if (!tag.annotated || tag.message !== want.message) {
        if (values.check) {
          problem(`${want.name} ${tag.annotated ? 'has a different message' : 'has no message'}; run pnpm tag-steps`)
        }
        else {
          annotate(repo, want.name, tag.commit, want.message)
          changed.push(`${label}: ${tag.annotated ? 'updated' : 'annotated'} ${want.name}`)
          tag = readTag(repo, want.name)!
        }
      }
      // The steps are one line: each tag comes before the next.
      if (previous && !isAncestor(repo, previous.commit, tag.commit)) {
        problem(`${want.name} doesn't come after ${previous.name}`)
      }
      previous = { name: want.name, commit: tag.commit }
    }

    const names = new Set(tags.map(t => t.name))
    for (const name of git(repo, ['tag', '--list', `${prefix}/*`]).split('\n').filter(Boolean)) {
      if (!names.has(name)) problem(`${name} is stale: no slide names it`)
    }

    if (values.remote) {
      const remote = remoteFor(repo, deck, track, values.remote)
      const theirs = remoteTags(repo, remote, prefix)
      for (const { name } of tags) {
        const ours = readTag(repo, name)
        const object = theirs.get(name)
        if (!object) problem(`${remote} has no ${name}`)
        else if (ours && object !== ours.object) problem(`${remote}'s ${name} isn't this one (another commit or message)`)
      }
      for (const name of theirs.keys()) {
        if (!names.has(name)) problem(`${remote} has ${name}, which is stale: no slide names it`)
      }
    }
  }
}

for (const line of changed) console.log(line)
if (problems.length) {
  for (const line of problems) console.error(`✗ ${line}`)
  process.exit(1)
}
console.log(values.check ? '✓ every step tag matches its deck' : changed.length ? 'push them: git push --force origin \'refs/tags/<workshop>/*\'' : '✓ nothing to change')
