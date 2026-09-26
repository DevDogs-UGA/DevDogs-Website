// Shell blocks (```bash, sh, zsh, shell) drawn as a real terminal session.
//
// Every command gets a prompt: the working directory, then the git branch
// when there is one, then ❯. The prompt follows the commands: `cd` moves it,
// cloning and then cd-ing into the clone puts it on `main`, `git switch`
// changes the branch. A line starting with `#` is an annotation, dimmed and
// with no prompt; a line after one ending in `\` continues the command. An
// idle prompt with a cursor closes the session.
//
// The prompts are real elements (so they can be two colours) marked
// `.dd-prompt`: snippet text skips them (lib/snippets.ts `lineText`), so
// copying or posting a block never picks up a prompt.
import type { TrackName } from './track'

export const SHELL_LANGS = ['bash', 'sh', 'zsh', 'shell', 'shellscript']

// Where each track's laptop has its repo, for blocks that don't say.
const TRACK_CWD: Record<TrackName, string> = {
  web: '~/Web-Workshops',
  mobile: '~/Mobile-Workshops',
}

export interface ShellStart {
  cwd?: string
  branch?: string
  track?: TrackName
}

function cdTo(cwd: string, arg: string): string {
  if (!arg || arg === '~') return '~'
  if (arg.startsWith('~') || arg.startsWith('/')) return arg.replace(/\/$/, '')
  let dir = cwd
  for (const part of arg.split('/')) {
    if (!part || part === '.') continue
    dir = part === '..' ? dir.replace(/\/[^/]*$/, '') || '~' : `${dir}/${part}`
  }
  return dir
}

function prompt(cwd: string, branch?: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'dd-prompt'
  el.setAttribute('aria-hidden', 'true')
  const dir = document.createElement('span')
  dir.className = 'dd-prompt-cwd'
  dir.textContent = cwd
  el.append(dir)
  if (branch) {
    const git = document.createElement('span')
    git.className = 'dd-prompt-git'
    git.textContent = ` ${branch}`
    el.append(git)
  }
  const arrow = document.createElement('span')
  arrow.className = 'dd-prompt-arrow'
  arrow.textContent = ' ❯ '
  el.append(arrow)
  return el
}

// Adds the prompts to a rendered block's `code` element. Safe to call again:
// it clears its own marks first.
export function decorateShell(code: HTMLElement, start: ShellStart) {
  code.querySelectorAll('.dd-prompt, .dd-shell-idle').forEach(el => el.remove())
  let cwd = start.cwd ?? (start.track ? TRACK_CWD[start.track] : '~')
  let branch = start.branch
  const clones = new Map<string, string>()
  let continues = false

  for (const line of Array.from(code.querySelectorAll<HTMLElement>(':scope > .line'))) {
    const text = line.textContent ?? ''
    const trimmed = text.trim()
    line.classList.remove('dd-shell-comment', 'dd-shell-cont')
    if (continues) {
      line.classList.add('dd-shell-cont')
      continues = text.trimEnd().endsWith('\\')
      continue
    }
    if (!trimmed) continue
    if (trimmed.startsWith('#')) {
      line.classList.add('dd-shell-comment')
      continue
    }
    line.prepend(prompt(cwd, branch))
    continues = text.trimEnd().endsWith('\\')

    // What this command does to the next prompt.
    const words = trimmed.replace(/\s+#.*$/, '').split(/\s+/)
    const clone = trimmed.match(/^(?:gh repo clone|git clone)\s+(\S+)(?:\s+(\S+))?/)
    if (clone) {
      const name = clone[2] ?? clone[1].replace(/\.git$/, '').split('/').pop()!
      clones.set(cdTo(cwd, name), 'main')
    }
    else if (words[0] === 'cd') {
      cwd = cdTo(cwd, words[1] ?? '~')
      branch = clones.get(cwd) ?? (cwd === '~' ? undefined : branch)
    }
    else if (words[0] === 'git' && (words[1] === 'switch' || words[1] === 'checkout')) {
      const target = words.slice(2).filter(w => !w.startsWith('-')).pop()
      if (target) branch = target
    }
  }

  const idle = document.createElement('span')
  idle.className = 'line dd-shell-idle'
  idle.setAttribute('aria-hidden', 'true')
  idle.append(prompt(cwd, branch))
  const cursor = document.createElement('span')
  cursor.className = 'dd-shell-cursor'
  idle.append(cursor)
  code.append('\n', idle)
}
