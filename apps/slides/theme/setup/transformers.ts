// Code on the slides comes straight from the workshop repos, so it can't
// drift from the finished demo. The repos are git submodules under
// apps/slides/workshops/ (web, mobile), pinned to their `02-supabase` answer
// key, and a slide names a file at a demo step:
//
//   <<< web@step-2:components/Guestbook.tsx {39-51|54-69}
//   <<< mobile:lib/guestbook.dart {90-94}
//
// Each line becomes a fenced block holding the whole file as of that commit,
// with line numbers on, so the ranges are the file's own line numbers and
// the code window pans to them (lib/viewport.ts). It works inside a Magic
// Move block too, one line per step.
//
// The revision is optional (default: the pinned commit, i.e. the finished
// demo) and is any git revision in the submodule, or `step-N`: the commit
// whose message says "step N," (the demo's steps are one commit each), or
// `step-0` for the commit before step 1, where the demo starts.
//
// Missing submodules, unknown revisions, and ranges past the end of the file
// fail the build rather than render stale or empty code.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { MarkdownTransformContext, TransformersSetup } from '@slidev/types'

const WORKSHOPS = fileURLToPath(new URL('../../workshops/', import.meta.url))
const REPOS = ['web', 'mobile'] as const

const LANGS: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  dart: 'dart',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  json: 'json',
  md: 'md',
}

const RE_IMPORT = /^<<<[ \t]+(web|mobile)(?:@(\S+?))?:(\S+)(?:[ \t]+\{([^}]*)\})?(?:[ \t]+(\{.*\}))?[ \t]*$/gm

function revision(rev: string | undefined): string {
  if (!rev) return 'HEAD'
  const step = rev.match(/^step-(\d+)$/)
  if (!step) return rev
  const n = Number(step[1])
  return n === 0 ? 'HEAD^{/step 1,}^' : `HEAD^{/step ${n},}`
}

function show(repo: string, rev: string | undefined, file: string, where: string): string {
  const dir = `${WORKSHOPS}${repo}`
  if (!existsSync(`${dir}/.git`)) {
    throw new Error(`${where}: workshops/${repo} is not checked out. Run \`git submodule update --init\` in Backstage.`)
  }
  try {
    return execFileSync('git', ['-C', dir, 'show', `${revision(rev)}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  catch (e) {
    const stderr = (e as { stderr?: string }).stderr?.trim()
    throw new Error(`${where}: can't read ${repo}@${rev ?? 'HEAD'}:${file} (${stderr || e})`)
  }
}

function checkRanges(ranges: string, lines: number, where: string) {
  for (const n of ranges.match(/\d+/g) ?? []) {
    if (Number(n) < 1 || Number(n) > lines) {
      throw new Error(`${where}: line ${n} is outside the file (${lines} lines)`)
    }
  }
}

export function expandWorkshopImports(ctx: MarkdownTransformContext) {
  const code = ctx.s.original
  for (const m of code.matchAll(RE_IMPORT)) {
    const [line, repo, rev, file, ranges = '', options = ''] = m
    const where = `${ctx.slide.source.filepath} (${line.trim()})`
    if (!REPOS.includes(repo as typeof REPOS[number])) continue
    const content = show(repo, rev, file, where).replace(/\n+$/, '')
    checkRanges(ranges, content.split('\n').length, where)
    if (/^`{3,}/m.test(content)) throw new Error(`${where}: the file contains a code fence`)
    const lang = LANGS[file.split('.').pop() ?? ''] ?? ''
    const opts = options ? options.replace(/^\{/, '{lines:true,') : '{lines:true}'
    const fence = `\`\`\`${lang} {${ranges || '*'}}${opts}\n${content}\n\`\`\``
    ctx.s.overwrite(m.index, m.index + line.length, fence)
  }
}

const setup: TransformersSetup = () => ({
  pre: [expandWorkshopImports],
})

export default setup
