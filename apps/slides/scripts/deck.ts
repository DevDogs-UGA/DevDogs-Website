// A deck read for print rather than the projector, shared by the scripts
// that write it down: `export-md.ts` (the docs pages) and `tag-steps.ts`
// (the workshop repos' step tags). See export-md.ts for what becomes of each
// slide.
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { load } from '@slidev/parser/fs'
import { buildPlan, checkRanges, commitOf, frame, langOf, linesOf, RE_IMPORT, show } from '../theme/setup/transformers.ts'

export type Track = 'web' | 'mobile'
export const TRACKS: Record<Track, string> = { web: 'Next.js', mobile: 'Flutter' }

export interface Frontmatter {
  layout?: string
  heading?: string
  chip?: string
  titlebar?: string
  trackSplit?: boolean
  docs?: boolean
  /** The demo tag this slide's step ends at (see LAYOUTS.md, Checkpoints). */
  checkpoint?: string
  docsPage?: string | PageStart
  hide?: boolean
  disabled?: boolean
}

// ---------------------------------------------------------------- code ----

// A fence, with the docs compiler's info-string attributes (`file=`,
// `lines=`, `cwd=`) after the language.
export function fence(lang: string, lines: string[], attributes = ''): string {
  return `\`\`\`${lang}${attributes ? ` ${attributes}` : ''}\n${lines.join('\n')}\n\`\`\``
}

// `[7, 8, 9, 11]` → `7-9,11`.
function rangesOf(numbers: number[]): string {
  const parts: string[] = []
  numbers.forEach((n, i) => {
    if (i > 0 && n === numbers[i - 1] + 1) parts[parts.length - 1] = parts.at(-1)!.replace(/-\d+$/, '') + `-${n}`
    else parts.push(String(n))
  })
  return parts.join(',')
}

function numbersIn(range: string, total: number): number[] {
  if (range.trim() === '*' || range.trim() === '') return Array.from({ length: total }, (_, i) => i + 1)
  return range.split(',').flatMap((part) => {
    const [a, b = a] = part.split('-').map(Number)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  })
}

// The given lines of a file, numbered as the file numbers them: the docs
// mark each skip. `blob` is the file on GitHub; the link picks out the lines.
function excerpt(lines: string[], numbers: number[], lang: string, file: string, blob: string): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const href = sorted.length === lines.length ? blob : `${blob}#L${sorted[0]}-L${sorted.at(-1)}`
  return fence(lang, sorted.map(n => lines[n - 1]), `file=${file} lines=${rangesOf(sorted)} href=${href}`)
}

type Chunk = ReturnType<typeof buildPlan>['all'][number]

interface Op {
  kind: ' ' | '-' | '+'
  line: string
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
    while (oldPos <= to) {
      ops.push({ kind: ' ', line: before[oldPos++ - 1] })
      newPos++
    }
  }
  all.forEach((h, i) => {
    // A pure insertion (oldCount 0) goes after old line oldStart.
    context(h.oldCount === 0 ? h.oldStart : h.oldStart - 1)
    for (let k = 0; k < h.oldCount; k++) ops.push({ kind: '-', line: before[oldPos++ - 1], chunk: i + 1 })
    for (let k = 0; k < h.newCount; k++) ops.push({ kind: '+', line: after[newPos++ - 1], chunk: i + 1 })
  })
  context(before.length)
  return ops
}

// Unchanged lines the docs show around each change; the reader can expand
// the rest of the file.
const DIFF_CONTEXT = 6

// One click group as a whole-file diff: the file as it stands before the
// click (the chunks in `prior` applied) against the file after it. The docs
// compiler (`context=`) cuts it down to the lines around the change and keeps
// both versions for expanding. Line numbers are the file's at that click,
// which is what a reader following along has in their editor.
function groupPatch(ops: Op[], prior: Set<number>, group: number[], file: string): string {
  const lines: string[] = []
  for (const op of ops) {
    const mine = op.chunk !== undefined && group.includes(op.chunk)
    // Another chunk's line is context if it's in the file at this click:
    // an applied chunk's new line, or a pending chunk's old one.
    const present = op.kind === ' ' || (op.chunk !== undefined && prior.has(op.chunk) ? op.kind === '+' : op.kind === '-')
    if (mine) lines.push(op.kind + op.line)
    else if (present) lines.push(' ' + op.line)
  }
  const oldCount = lines.filter(l => l[0] !== '+').length
  const newCount = lines.filter(l => l[0] !== '-').length
  const range = (count: number) => (count === 0 ? '0,0' : `1,${count}`)
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${range(oldCount)} +${range(newCount)} @@`,
    // Trimmed, as the docs repo's Prettier leaves a blank context line.
    ...lines.map(l => l.trimEnd()),
  ].join('\n')
}

// The public GitHub repo each workshop submodule publishes to, from the deck
// headmatter's `docs.repos` (the submodules point at private planning repos
// with the same commits).
let REPOS: Partial<Record<Track, string>> = {}

function repoSlug(repo: Track, where: string): string {
  const slug = REPOS[repo]
  if (!slug) throw new Error(`${where}: the headmatter's docs.repos names no GitHub repo for ${repo}`)
  return slug
}

// The file on GitHub as of the imported commit.
function blobUrl(repo: Track, rev: string | undefined, file: string, where: string): string {
  return `https://github.com/${repoSlug(repo, where)}/blob/${commitOf(repo, rev, where)}/${file}`
}

// The imported commit's change to the file, in GitHub's compare view.
// GitHub anchors a file in the view by the SHA-256 of its path.
function compareUrl(repo: Track, rev: string | undefined, file: string, where: string): string {
  const commit = commitOf(repo, rev, where)
  const parent = commitOf(repo, `${commit}^`, where)
  const anchor = createHash('sha256').update(file).digest('hex')
  return `https://github.com/${repoSlug(repo, where)}/compare/${parent}...${commit}#diff-${anchor}`
}

// A link to the whole file as of the imported commit: the reader's way to
// catch up, costing the page no words.
function wholeFile(repo: Track, rev: string | undefined, file: string, where: string): string {
  return `[The whole \`${file}\` at this point](${blobUrl(repo, rev, file, where)})`
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
  const parts: string[] = []
  // Every block names its own file in its tab; a caption only adds where it
  // goes (Dashboard → SQL Editor).
  if (caption) parts.push(`${caption}:`)

  const buildSpec = ranges.match(/^build(?::(.+))?$/)
  if (buildSpec) {
    const { before, after, all, done, groups } = buildPlan(repo, rev, file, buildSpec[1], where)
    const applied = new Set(done)
    const ops = commitOps(before, after, all)
    const intro = tips[0] && dropLitLines(tips[0])
    if (intro) parts.push(intro)
    const track = repo as Track
    const compare = before.length ? compareUrl(track, rev, file, where) : ''
    const blob = blobUrl(track, rev, file, where)
    groups.forEach((group, g) => {
      const prior = new Set(applied)
      group.forEach(n => applied.add(n))
      if (tips[g + 1]) parts.push(tips[g + 1])
      // A new file reads better whole, as it stands after this click.
      parts.push(before.length
        ? fence('diff', [groupPatch(ops, prior, group, file)], `file=${file} lang=${lang} context=${DIFF_CONTEXT} href=${compare}`)
        : fence(lang, frame(before, after, all, new Set(applied), new Set()).lines, `file=${file} href=${blob}`))
    })
    if (applied.size === all.length && before.length) {
      parts.push(wholeFile(repo as Track, rev, file, where))
    }
    return parts.join('\n\n')
  }

  const lines = linesOf(show(repo, rev, file, where))
  checkRanges(ranges, lines.length, where)
  const blob = blobUrl(repo as Track, rev, file, where)
  const steps = ranges ? ranges.split('|') : ['*']
  if (!tips.some(Boolean)) {
    parts.push(excerpt(lines, steps.flatMap(r => numbersIn(r, lines.length)), lang, file, blob))
  }
  else {
    const shown = new Set<number>()
    steps.forEach((range, k) => {
      const numbers = numbersIn(range, lines.length)
      // A range with no tip of its own that repeats what's already shown
      // (a "the whole thing" click at the end) adds nothing on paper.
      if (!tips[k] && numbers.every(n => shown.has(n))) return
      if (tips[k]) parts.push(tips[k])
      parts.push(excerpt(lines, numbers, lang, file, blob))
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

export const RE_FENCE = /^(?<ticks>`{3,})[^\n]*\n[\s\S]*?^\k<ticks>[ \t]*$/gm

export const SHELL_LANGS = new Set(['bash', 'sh', 'zsh', 'shell', 'shellscript'])

// Where each track's laptop has its repo, as the slides' terminals assume
// for a block that doesn't say (theme/lib/shell.ts).
export const TRACK_CWD: Record<Track, string> = { web: '~/Web-Workshops', mobile: '~/Mobile-Workshops' }

// A fence's opening line with Slidev's own options (`{*}{cwd:'~'}`) swapped
// for the docs compiler's attributes: a terminal keeps its `cwd`/`branch`,
// and starts in `cwd` when it names none.
function fenceOpening(line: string, cwd: string | undefined): string {
  return line.replace(/^(`{3,})(\w*)([ \t]+\{.*)?$/, (_, ticks: string, lang: string, options = '') => {
    if (!SHELL_LANGS.has(lang)) return `${ticks}${lang}`
    const dir = /cwd:\s*'([^']*)'/.exec(options)?.[1] ?? cwd
    const branch = /branch:\s*'([^']*)'/.exec(options)?.[1]
    const attributes = [dir && `cwd=${dir}`, branch && `branch=${branch}`].filter(Boolean).join(' ')
    return `${ticks}${lang}${attributes ? ` ${attributes}` : ''}`
  })
}

function prose(text: string, fm: Frontmatter, level: number, cwd?: string): string {
  // Fenced code passes through untouched, bar its opening line
  // (`fenceOpening`).
  // split() also returns the fence's own backreference group: every third
  // piece, dropped at the end.
  return text.split(new RegExp(`(${RE_FENCE.source})`, 'm')).map((part, i) => {
    if (i % 3 === 1) {
      const [opening, ...rest] = part.split('\n')
      return [fenceOpening(opening, cwd), ...rest].join('\n')
    }
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

// What a slide says to one track, still in the deck's markdown: comments
// and presenter notes dropped, and only that track's column and `<Track>`s.
function trackSource(slide: Slide, track: Track): string {
  let body = slide.content.replace(/<!--[\s\S]*?-->/g, '')
  if (slide.note) body = body.replace(slide.note, '')

  // Slots: a `dual-code` split keeps the page's column; every other layout's
  // slots are just more of the slide, in order.
  if (slide.frontmatter.layout === 'dual-code' && slide.frontmatter.trackSplit !== false) {
    const [left, right = ''] = body.split(/^::right::$/m)
    body = track === 'web' ? left : right
  }
  body = body.replace(/^::\w+::$/gm, '')
  return forTrack(body, track)
}

function slideToMarkdown(slide: Slide, track: Track, cwd: string | undefined): string {
  const fm = slide.frontmatter
  const body = trackSource(slide, track)

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
      parts.push(codeImport(token, tips.map(t => prose(t, {}, level + 1, cwd)), caption))
    }
    else if (token.startsWith('<CodeTips>')) {
      throw new Error(`${fm.heading ?? 'a slide'}: <CodeTips> without an import before it`)
    }
    else if (token.trim()) {
      const text = prose(token.trim(), fm, level, cwd)
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


export interface PageStart {
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

export interface DocsConfig {
  description?: string
  /** Where the pages are on the docs site, e.g. `/docs/workshops/supabase`. */
  url?: string
  /** When the pages go live (an ISO time with a zone): the docs hide them
   * until then. Written onto each track's folder and the shared pages. */
  scheduled?: string
  repos?: Partial<Record<Track, string>>
  /** Per track: its folder, name and order, and `start`, the branch the
   * demo starts from before the first checkpoint. */
  tracks?: Partial<Record<Track, { dir: string, name: string, order?: number, start?: string }>>
}

export function pageStartOf(fm: Frontmatter): PageStart | undefined {
  const raw = fm.docsPage
  return typeof raw === 'string' ? { file: raw } : raw
}

export interface Slide {
  content: string
  note?: string
  frontmatter: Frontmatter
}

export interface Deck {
  entry: string
  docs: DocsConfig
  /** The slides that go on paper, in order. */
  slides: Slide[]
}

export async function loadDeck(entry: string): Promise<Deck> {
  const data = await load({ roots: [dirname(entry)], userRoot: dirname(entry) }, entry)
  const docs = (data.headmatter.docs ?? {}) as DocsConfig
  REPOS = docs.repos ?? {}
  const slides = data.slides.filter((s) => {
    const fm = s.frontmatter as Frontmatter
    return !fm.hide && !fm.disabled && fm.docs !== false
  }) as Slide[]
  if (!slides.length || !pageStartOf(slides[0].frontmatter)) {
    throw new Error(`${entry}: the first exported slide needs docsPage, to start the first page`)
  }
  return { entry, docs, slides }
}

export interface Page {
  start: PageStart
  slides: Slide[]
  /** The step tag the page's step ends at, from its slides' `checkpoint`. */
  checkpoint?: string
}

// Slides in order, cut into pages wherever a slide says docsPage.
export function pagesOf(slides: Slide[]): Page[] {
  const pages: Page[] = []
  for (const slide of slides) {
    const start = pageStartOf(slide.frontmatter)
    if (start) pages.push({ start, slides: [] })
    const page = pages.at(-1)!
    page.slides.push(slide)
    const { checkpoint } = slide.frontmatter
    if (checkpoint && page.checkpoint && checkpoint !== page.checkpoint) {
      throw new Error(`docsPage ${page.start.file}: two checkpoints (${page.checkpoint}, ${checkpoint}); a page is one step`)
    }
    if (checkpoint) page.checkpoint = checkpoint
  }
  return pages
}

// One page's title and markdown for a track: its slides, the first slide's
// `##` heading taken for the title, and every deeper heading moved up a level
// to sit under it.
export function pageContent(page: Page, track: Track): { title: string, body: string } {
  const cwd = page.start.shared ? undefined : TRACK_CWD[track]
  let body = page.slides.map(s => slideToMarkdown(s, track, cwd)).filter(Boolean).map(dropRepeats).join('\n\n')
  let title = page.start.title
  const first = body.match(/^## (.*)\n?/)
  if (first) {
    title ??= first[1]
    body = body.slice(first[0].length)
  }
  if (!title) throw new Error(`docsPage ${page.start.file}: no title, and its first slide has no heading`)
  body = body.replace(/^(#{3,6}) /gm, (_, hashes: string) => `${hashes.slice(1)} `).replace(/\n{3,}/g, '\n\n').trim()
  return { title, body }
}

// The commands a page has a reader run, in order: each line of its shell
// blocks for the track, bar `#` annotations, with a `\` line joined to the
// next. A block marked `{run: false}` (```bash {*}{run: false}) is shown but
// never run for them: `pnpm dev`, which doesn't exit.
export function pageCommands(page: Page, track: Track): string[] {
  const commands: string[] = []
  for (const slide of page.slides) {
    for (const block of trackSource(slide, track).match(RE_FENCE) ?? []) {
      const [opening, ...lines] = block.split('\n').slice(0, -1)
      const lang = opening.match(/^`{3,}(\w*)/)![1]
      if (!SHELL_LANGS.has(lang) || /\brun:\s*false\b/.test(opening)) continue
      let pending = ''
      for (const line of lines) {
        if (!pending && (!line.trim() || line.trim().startsWith('#'))) continue
        pending += line.trim()
        if (pending.endsWith('\\')) pending = `${pending.slice(0, -1).trimEnd()} `
        else {
          commands.push(pending)
          pending = ''
        }
      }
      if (pending) commands.push(pending.trim())
    }
  }
  return commands
}
