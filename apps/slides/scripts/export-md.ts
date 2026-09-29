// Writes a deck out as markdown for the docs site: a folder of step pages per
// track, plus any pages both tracks share.
//
//   pnpm export:md [decks/<deck>.md] --out <docs>/workshops/<workshop>
//
// A slide deck is a poor handout: its code windows pan and build click by
// click, so a PDF only catches one frame of each. This reads the same slides
// and writes what a reader needs instead, in slide order:
//
// - `<Track>` content and `dual-code` columns for the page's track only.
// - A `{build}` import (theme/setup/transformers.ts) becomes one diff per
//   click group, each after the tip for that click, then a link to the whole
//   file on GitHub at that commit. A ranged import becomes one excerpt per
//   range that has a tip, or every range's lines at once when none do.
// - `<CodeTips>` become the prose between the code; presenter notes are
//   dropped.
//
// A slide with `docsPage` starts a new page (`file`, and optionally `title`,
// `description`, and `shared: true` for one page beside the track folders).
// Each track's folder gets a body-less index.md naming it a course (`steps:
// true`, see the docs compiler). The deck headmatter's `docs` key names the
// track folders and the public repos the file links point at. Slides with
// `docs: false` are left out: the preshow, the competition, upcoming events.
//
// Anything else the exporter doesn't know how to write down (a Vue component,
// a layout slot) fails the export rather than leaking into the page.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { load } from '@slidev/parser/fs'
import { buildPlan, checkRanges, commitOf, frame, langOf, linesOf, RE_IMPORT, show } from '../theme/setup/transformers.ts'

type Track = 'web' | 'mobile'
const TRACKS: Record<Track, string> = { web: 'Next.js', mobile: 'Flutter' }

const APP = fileURLToPath(new URL('..', import.meta.url))
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
})
const entry = resolve(APP, positionals[0] ?? 'decks/2026-09-28-supabase.md')

interface Frontmatter {
  layout?: string
  heading?: string
  chip?: string
  titlebar?: string
  trackSplit?: boolean
  docs?: boolean
  hide?: boolean
  disabled?: boolean
}

// ---------------------------------------------------------------- code ----

// A line comment for the gap between excerpts, in the file's own language.
function gapLine(lang: string): string {
  if (['sql'].includes(lang)) return '-- …'
  if (['bash', 'dotenv', 'yaml', 'toml'].includes(lang)) return '# …'
  return '// …'
}

function fence(lang: string, lines: string[]): string {
  return `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``
}

function numbersIn(range: string, total: number): number[] {
  if (range.trim() === '*' || range.trim() === '') return Array.from({ length: total }, (_, i) => i + 1)
  return range.split(',').flatMap((part) => {
    const [a, b = a] = part.split('-').map(Number)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })
}

// The given line numbers of a file, with a gap marker wherever they skip.
function excerpt(lines: string[], numbers: number[], lang: string): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const out: string[] = []
  sorted.forEach((n, i) => {
    if (i > 0 && n !== sorted[i - 1] + 1) out.push(gapLine(lang))
    out.push(lines[n - 1])
  })
  return fence(lang, out)
}

type Chunk = ReturnType<typeof buildPlan>['all'][number]

interface Op {
  kind: ' ' | '-' | '+'
  line: string
  /** The line numbers this op sits at in the old and new file. */
  oldAt: number
  newAt: number
  /** The chunk a change belongs to (numbered from 1), none for context. */
  chunk?: number
}

// The commit's real diff of one file as a run of ops, rebuilt from git's own
// hunks (`buildPlan`'s chunks) rather than recomputed, so its changes are
// exactly the ones the slides build up.
function commitOps(before: string[], after: string[], all: Chunk[]): Op[] {
  const ops: Op[] = []
  let oldPos = 1
  let newPos = 1
  const context = (to: number) => {
    while (oldPos <= to) ops.push({ kind: ' ', line: before[oldPos - 1], oldAt: oldPos++, newAt: newPos++ })
  }
  all.forEach((h, i) => {
    // A pure insertion (oldCount 0) goes after old line oldStart.
    context(h.oldCount === 0 ? h.oldStart : h.oldStart - 1)
    for (let k = 0; k < h.oldCount; k++) ops.push({ kind: '-', line: before[oldPos - 1], oldAt: oldPos++, newAt: newPos, chunk: i + 1 })
    for (let k = 0; k < h.newCount; k++) ops.push({ kind: '+', line: after[newPos - 1], oldAt: oldPos, newAt: newPos++, chunk: i + 1 })
  })
  context(before.length)
  return ops
}

// A real unified diff of one click group: the commit's changes that belong to
// the group's chunks, with up to three lines of real context either side, and
// the real line numbers of both files in each hunk header. Another group's
// change is never shown; context stops where one begins.
function groupPatch(ops: Op[], group: number[], file: string, isNew: boolean): string {
  const CONTEXT = 3
  const keep = ops.map(() => false)
  ops.forEach((op, k) => {
    if (op.chunk === undefined || !group.includes(op.chunk)) return
    keep[k] = true
    for (const step of [-1, 1]) {
      for (let c = k + step, n = 0; n < CONTEXT && c >= 0 && c < ops.length && ops[c].kind === ' '; c += step, n++) keep[c] = true
    }
  })
  const hunks: Op[][] = []
  ops.forEach((op, k) => {
    if (!keep[k]) return
    if (k === 0 || !keep[k - 1]) hunks.push([])
    hunks.at(-1)!.push(op)
  })
  const header = (at: number, count: number) => `${count === 0 ? at - 1 : at},${count}`
  const body = hunks.flatMap((hunk) => {
    const oldCount = hunk.filter(op => op.kind !== '+').length
    const newCount = hunk.filter(op => op.kind !== '-').length
    return [
      `@@ -${header(hunk[0].oldAt, oldCount)} +${header(hunk[0].newAt, newCount)} @@`,
      // Trimmed, as the docs repo's Prettier leaves a blank context line.
      ...hunk.map(op => `${op.kind}${op.line}`.trimEnd()),
    ]
  })
  return [isNew ? '--- /dev/null' : `--- a/${file}`, `+++ b/${file}`, ...body].join('\n')
}

// The public GitHub repo each workshop submodule publishes to, from the deck
// headmatter's `docs.repos` (the submodules point at private planning repos
// with the same commits).
let REPOS: Partial<Record<Track, string>> = {}

// A link to the whole file as of the imported commit: the reader's way to
// catch up, costing the page no words.
function wholeFile(repo: Track, rev: string | undefined, file: string, where: string): string {
  const slug = REPOS[repo]
  if (!slug) throw new Error(`${where}: the headmatter's docs.repos names no GitHub repo for ${repo}`)
  const url = `https://github.com/${slug}/blob/${commitOf(repo, rev, where)}/${file}`
  return `[The whole \`${file}\` at this point](${url})`
}

// The tips' click-0 text on a build slide points at the lit lines, which a
// diff has no need of.
function dropLitLines(tip: string): string {
  return tip.split(/(?<=[.!?])\s+/).filter(s => !/\blit lines?\b/i.test(s)).join(' ')
}

function codeImport(line: string, tips: string[], caption: string): string {
  const m = [...line.matchAll(RE_IMPORT)][0]
  const [, repo, rev, file, ranges = '', options = ''] = m
  const where = `${file} (${line.trim()})`
  if (options) throw new Error(`${where}: import options aren't supported in the export`)
  const lang = langOf(file)
  const head = caption ? `${caption} — \`${file}\`` : `\`${file}\``
  const parts: string[] = []

  const buildSpec = ranges.match(/^build(?::(.+))?$/)
  if (buildSpec) {
    const { before, after, all, done, groups } = buildPlan(repo, rev, file, buildSpec[1], where)
    const applied = new Set(done)
    const ops = commitOps(before, after, all)
    const intro = tips[0] && dropLitLines(tips[0])
    if (intro) parts.push(intro)
    // Each diff names its own file; a caption only adds where it goes.
    if (caption || !before.length) parts.push(`${head}:`)
    groups.forEach((group, g) => {
      group.forEach(n => applied.add(n))
      if (tips[g + 1]) parts.push(tips[g + 1])
      // A new file reads better whole, as it stands after this click.
      parts.push(before.length
        ? `\`\`\`diff file=${file} lang=${lang}\n${groupPatch(ops, group, file, false)}\n\`\`\``
        : fence(lang, frame(before, after, all, new Set(applied), new Set()).lines))
    })
    if (applied.size === all.length && before.length) {
      parts.push(wholeFile(repo as Track, rev, file, where))
    }
    return parts.join('\n\n')
  }

  const lines = linesOf(show(repo, rev, file, where))
  checkRanges(ranges, lines.length, where)
  const steps = ranges ? ranges.split('|') : ['*']
  parts.push(`${head}:`)
  if (!tips.some(Boolean)) {
    parts.push(excerpt(lines, steps.flatMap(r => numbersIn(r, lines.length)), lang))
  }
  else {
    const shown = new Set<number>()
    steps.forEach((range, k) => {
      const numbers = numbersIn(range, lines.length)
      // A range with no tip of its own that repeats what's already shown
      // (a "the whole thing" click at the end) adds nothing on paper.
      if (!tips[k] && numbers.every(n => shown.has(n))) return
      if (tips[k]) parts.push(tips[k])
      parts.push(excerpt(lines, numbers, lang))
      numbers.forEach(n => shown.add(n))
    })
    if (shown.size < lines.length) {
      parts.push(wholeFile(repo as Track, rev, file, where))
    }
  }
  return parts.join('\n\n')
}

// ---------------------------------------------------------------- prose ---

function tipsOf(block: string): string[] {
  const tips: string[] = []
  for (const m of block.matchAll(/<template #(\d+)>([\s\S]*?)<\/template>/g)) {
    tips[Number(m[1])] = m[2].trim()
  }
  return tips
}

// A two-column `<table>` of `<th>`/`<td>` rows (the provider settings) as a
// markdown table.
function htmlTable(html: string, indent: string): string {
  const rows = [...html.matchAll(/<tr><th>([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><\/tr>/g)]
  const cell = (s: string) => s.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`').replace(/\|/g, '\\|')
  // Padded to column width, the way the docs repo's Prettier writes a table.
  const table = [['Setting', 'Value'], ...rows.map(r => [cell(r[1]), cell(r[2])])]
  const widths = [0, 1].map(c => Math.max(...table.map(row => row[c].length)))
  const line = (row: string[]) => `| ${row.map((c, k) => c.padEnd(widths[k])).join(' | ')} |`
  return [line(table[0]), line(widths.map(w => '-'.repeat(w))), ...table.slice(1).map(line)]
    .map(l => indent + l).join('\n')
}

const RE_FENCE = /^(?<ticks>`{3,})[^\n]*\n[\s\S]*?^\k<ticks>[ \t]*$/gm

function prose(text: string, fm: Frontmatter, level: number): string {
  // Fenced code passes through untouched, bar Slidev's own fence options
  // (`{*}{cwd:'~'}`), which mean nothing here.
  // split() also returns the fence's own backreference group: every third
  // piece, dropped at the end.
  return text.split(new RegExp(`(${RE_FENCE.source})`, 'm')).map((part, i) => {
    if (i % 3 === 1) return part.replace(/^(`{3,})(\w*)[ \t]+\{.*$/m, '$1$2')
    let out = part
      .replace(/<\/?v-clicks?>/g, '')
      .replace(/^(\s*)- <table[^>]*>([\s\S]*?)<\/table>/gm, (_, indent: string, body: string) => `\n${htmlTable(body, `${indent} `)}\n`)
      .replace(/^#+ (.*)$/gm, (_, title: string) => `${'#'.repeat(level)} ${title}`)
    if (fm.layout === 'numbered-list') {
      out = out.replace(/^- /gm, '1. ').replace(/^ {2}(?=- |\| )/gm, '   ')
    }
    return out
  }).filter((_, i) => i % 3 !== 2).join('')
}

// ---------------------------------------------------------------- slides --

function forTrack(content: string, track: Track): string {
  return content.replace(/<Track (web|mobile)>([\s\S]*?)<\/Track>/g, (_, which: Track, body: string) => which === track ? body : '')
}

function slideToMarkdown(content: string, note: string | undefined, fm: Frontmatter, track: Track): string {
  let body = content.replace(/<!--[\s\S]*?-->/g, '')
  if (note) body = body.replace(note, '')

  // Slots: a `dual-code` split keeps the page's column; every other layout's
  // slots are just more of the slide, in order.
  if (fm.layout === 'dual-code' && fm.trackSplit !== false) {
    const [left, right = ''] = body.split(/^::right::$/m)
    body = track === 'web' ? left : right
  }
  body = body.replace(/^::\w+::$/gm, '')
  body = forTrack(body, track)

  const step = fm.chip?.match(/^STEP (\d+)$/)
  const major = fm.layout === 'section-divider' || Boolean(step)
  const level = major ? 2 : 3
  const parts: string[] = []
  if (fm.heading) parts.push(`${'#'.repeat(level)} ${fm.heading}`)

  const caption = fm.titlebar && !/^(editor|terminal)$/i.test(fm.titlebar) ? `**${fm.titlebar}**` : ''
  // Split into prose, `<<<` imports, and the `<CodeTips>` that follow each.
  const tokens = body.split(/(^<<<.*$|<CodeTips>[\s\S]*?<\/CodeTips>)/m)
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k]
    if (token.startsWith('<<<')) {
      let tips: string[] = []
      const next = tokens.slice(k + 1).findIndex(t => t.trim() !== '')
      if (next !== -1 && tokens[k + 1 + next].startsWith('<CodeTips>')) {
        tips = tipsOf(tokens[k + 1 + next])
        tokens[k + 1 + next] = ''
      }
      parts.push(codeImport(token, tips.map(t => prose(t, {}, level + 1)), caption))
    }
    else if (token.startsWith('<CodeTips>')) {
      throw new Error(`${fm.heading ?? 'a slide'}: <CodeTips> without an import before it`)
    }
    else if (token.trim()) {
      const text = prose(token.trim(), fm, level)
      const component = text.replace(RE_FENCE, '').match(/<[A-Z][\w-]*|<ph-[\w-]+/)
      if (component) throw new Error(`${fm.heading ?? text.split('\n')[0]}: ${component[0]}> has no markdown form`)
      parts.push(text)
    }
  }
  return parts.join('\n\n')
}

// A slide that continues the one before it (same heading, the same terminal
// beside a new file) reads as one section on paper: its repeated heading and
// code blocks go.
function dropRepeats(page: string, k: number, pages: string[]): string {
  if (k === 0) return page
  const before = pages[k - 1]
  const heading = before.match(/^#+ .*$/m)?.[0]
  let out = heading && page.startsWith(`${heading}\n`) ? page.slice(heading.length) : page
  for (const block of before.match(RE_FENCE) ?? []) out = out.replace(block, '')
  return out.trim()
}

// ---------------------------------------------------------------- main ----

interface PageStart {
  /** The page's file name, without `.md`. */
  file: string
  /** Its title; else the heading of the slide that starts it. */
  title?: string
  description?: string
  /** One page for both tracks, beside the track folders rather than in them. */
  shared?: boolean
  /** A shared page's place in the workshop folder. */
  order?: number
}

interface DocsConfig {
  description?: string
  repos?: Partial<Record<Track, string>>
  tracks?: Partial<Record<Track, { dir: string, name: string, order?: number }>>
}

const GENERATED = `<!-- Generated from Backstage apps/slides/${entry.slice(APP.length)} by \`pnpm export:md\`; edit the deck, not this file. -->`

function pageStartOf(fm: Frontmatter & { docsPage?: string | PageStart }): PageStart | undefined {
  const raw = fm.docsPage
  return typeof raw === 'string' ? { file: raw } : raw
}

function frontmatter(fields: Record<string, string | number | boolean | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}`)
  return ['---', ...lines, '---'].join('\n')
}

// One page's markdown: its slides, the first slide's `##` heading taken for
// the title, and every deeper heading moved up a level to sit under it.
function pageMarkdown(start: PageStart, slides: string[], order: number | undefined): { text: string, body: string } {
  let body = slides.filter(Boolean).map(dropRepeats).join('\n\n')
  let title = start.title
  const first = body.match(/^## (.*)\n?/)
  if (first) {
    title ??= first[1]
    body = body.slice(first[0].length)
  }
  if (!title) throw new Error(`docsPage ${start.file}: no title, and its first slide has no heading`)
  body = body.replace(/^(#{3,6}) /gm, (_, hashes: string) => `${hashes.slice(1)} `).replace(/\n{3,}/g, '\n\n').trim()
  const head = frontmatter({ name: title, description: start.description, order })
  // The code is the workshop repos' own, formatted their way, so the docs
  // repo's Prettier (which formats code blocks too) is told to leave it.
  const text = `${head}\n\n${GENERATED}\n\n# ${title}\n\n<!-- prettier-ignore-start -->\n\n${body}\n\n<!-- prettier-ignore-end -->\n`
  return { body, text }
}

// Only files this script wrote go, so a hand-written page beside them is safe.
function clearGenerated(dir: string) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const file = join(dir, name)
    if (name.endsWith('.md') && readFileSync(file, 'utf8').includes('by `pnpm export:md`')) rmSync(file)
  }
}

const data = await load({ roots: [dirname(entry)], userRoot: dirname(entry) }, entry)
const docs = (data.headmatter.docs ?? {}) as DocsConfig
REPOS = docs.repos ?? {}

const slides = data.slides.filter((s) => {
  const fm = s.frontmatter as Frontmatter
  return !fm.hide && !fm.disabled && fm.docs !== false
})
if (!slides.length || !pageStartOf(slides[0].frontmatter)) {
  throw new Error(`${entry}: the first exported slide needs docsPage, to start the first page`)
}

const out = resolve(values.out ?? join(APP, 'export', basename(entry, '.md')))
mkdirSync(out, { recursive: true })
const shared = new Map<string, string>()

for (const track of Object.keys(TRACKS) as Track[]) {
  const config = docs.tracks?.[track]
  if (!config) throw new Error(`${entry}: the headmatter's docs.tracks has no ${track} entry`)
  const dir = join(out, config.dir)
  clearGenerated(dir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.md'), `${frontmatter({ name: config.name, description: docs.description, order: config.order, steps: true })}\n`)

  // Slides in order, cut into pages wherever a slide says docsPage.
  const pages: { start: PageStart, slides: string[] }[] = []
  for (const s of slides) {
    const start = pageStartOf(s.frontmatter)
    if (start) pages.push({ start, slides: [] })
    pages.at(-1)!.slides.push(slideToMarkdown(s.content, s.note, s.frontmatter as Frontmatter, track))
  }

  let step = 0
  for (const { start, slides: parts } of pages) {
    if (start.shared) {
      const { body, text } = pageMarkdown(start, parts, start.order)
      const seen = shared.get(start.file)
      if (seen !== undefined && seen !== body) {
        throw new Error(`docsPage ${start.file}: shared, but it reads differently for ${track}`)
      }
      shared.set(start.file, body)
      writeFileSync(join(out, `${start.file}.md`), text)
      continue
    }
    const file = join(dir, `${start.file}.md`)
    writeFileSync(file, pageMarkdown(start, parts, step++).text)
    console.log(`wrote ${file}`)
  }
}
for (const file of shared.keys()) console.log(`wrote ${join(out, `${file}.md`)}`)
