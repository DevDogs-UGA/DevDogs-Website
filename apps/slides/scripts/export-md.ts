// Writes a deck out as markdown, one page per track, for the docs site:
//
//   pnpm export:md                          # the default deck, into export/
//   pnpm export:md decks/<deck>.md --out <dir>
//
// A slide deck is a poor handout: its code windows pan and build click by
// click, so a PDF only catches one frame of each. This reads the same slides
// and writes what a reader needs instead, in slide order:
//
// - `<Track>` content and `dual-code` columns for the page's track only.
// - A `{build}` import (theme/setup/transformers.ts) becomes one diff per
//   click group, each after the tip for that click, plus the whole file once
//   the step is complete. A ranged import becomes one excerpt per range that
//   has a tip, or every range's lines at once when none do.
// - `<CodeTips>` become the prose between the code; presenter notes are
//   dropped.
//
// Slides with `docs: false` (set on a whole fragment's `src:` slide in the
// deck) are left out: the preshow, the competition, upcoming events. The
// page's title and description come from the deck headmatter's `docs` key.
//
// Anything else the exporter doesn't know how to write down (a Vue component,
// a layout slot) fails the export rather than leaking into the page.
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { load } from '@slidev/parser/fs'
import { buildPlan, checkRanges, frame, langOf, linesOf, RE_IMPORT, show } from '../theme/setup/transformers.ts'

type Track = 'web' | 'mobile'
const TRACKS: Record<Track, string> = { web: 'Next.js', mobile: 'Flutter' }

const APP = fileURLToPath(new URL('..', import.meta.url))
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string', default: join(APP, 'export') } },
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

// A unified diff of two versions of a file, three lines of context, hunks
// separated by an `@@` line. Files here are a few hundred lines, so a plain
// LCS table is plenty.
function diff(a: string[], b: string[]): string {
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const ops: { kind: ' ' | '-' | '+', line: string }[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: ' ', line: a[i++] })
      j++
    }
    // Removals before additions, as `git diff` prints them.
    else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      ops.push({ kind: '-', line: a[i++] })
    }
    else {
      ops.push({ kind: '+', line: b[j++] })
    }
  }
  const CONTEXT = 3
  const keep = ops.map(() => false)
  ops.forEach((op, k) => {
    if (op.kind === ' ') return
    for (let c = Math.max(0, k - CONTEXT); c <= Math.min(ops.length - 1, k + CONTEXT); c++) keep[c] = true
  })
  const out: string[] = []
  ops.forEach((op, k) => {
    if (!keep[k]) return
    if (out.length && !keep[k - 1]) out.push('@@')
    out.push(`${op.kind}${op.line}`)
  })
  return fence('diff', out)
}

function details(summary: string, body: string): string {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`
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
    const intro = tips[0] && dropLitLines(tips[0])
    if (intro) parts.push(intro)
    parts.push(`${head}:`)
    groups.forEach((group, g) => {
      const was = frame(before, after, all, new Set(applied), new Set()).lines
      group.forEach(n => applied.add(n))
      const now = frame(before, after, all, new Set(applied), new Set()).lines
      if (tips[g + 1]) parts.push(tips[g + 1])
      parts.push(was.length ? diff(was, now) : fence(lang, now))
    })
    if (applied.size === all.length && before.length) {
      parts.push(details(`The whole <code>${file}</code> after this step`, fence(lang, after)))
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
      parts.push(details(`The whole <code>${file}</code>`, fence(lang, lines)))
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
  return [
    '| Setting | Value |',
    '| --- | --- |',
    ...rows.map(r => `| ${cell(r[1])} | ${cell(r[2])} |`),
  ].map(l => indent + l).join('\n')
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
      .replace(/^(\s*)- <table[^>]*>([\s\S]*?)<\/table>/gm, (_, indent: string, body: string) => `\n${htmlTable(body, `${indent}  `)}\n`)
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
  if (step) body = body.replace(/^# (.*)$/m, `# Step ${step[1]}: $1`)

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

const data = await load({ roots: [dirname(entry)], userRoot: dirname(entry) }, entry)
const docs = (data.headmatter.docs ?? {}) as { title?: string, description?: string }
if (!docs.title) throw new Error(`${entry}: the headmatter needs docs.title for the exported pages`)

const slides = data.slides.filter((s) => {
  const fm = s.frontmatter as Frontmatter
  return !fm.hide && !fm.disabled && fm.docs !== false
})

mkdirSync(values.out, { recursive: true })
for (const track of Object.keys(TRACKS) as Track[]) {
  const title = `${docs.title} (${TRACKS[track]})`
  const header = [
    '---',
    `name: ${JSON.stringify(title)}`,
    ...(docs.description ? [`description: ${JSON.stringify(docs.description)}`] : []),
    '---',
    '',
    `<!-- Generated from apps/slides/${entry.slice(APP.length)} by \`pnpm export:md\`; edit the deck, not this file. -->`,
    '',
    `# ${title}`,
  ].join('\n')
  const body = slides
    .map(s => slideToMarkdown(s.content, s.note, s.frontmatter as Frontmatter, track))
    .filter(Boolean)
    .map(dropRepeats)
  const file = join(values.out, `${basename(entry, '.md')}.${track}.md`)
  writeFileSync(file, `${[header, ...body].join('\n\n').replace(/\n{3,}/g, '\n\n')}\n`)
  console.log(`wrote ${file}`)
}
