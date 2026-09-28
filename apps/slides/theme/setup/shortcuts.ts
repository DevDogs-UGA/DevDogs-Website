// `p` in the presenter view posts every code block on the current slide to
// Discord (see lib/snippets.ts). The base shortcuts pass through untouched.
import type { ShortcutOptions } from '@slidev/types'
import { useNav } from '@slidev/client'
import { postPage } from '../lib/snippets'

export default function setupShortcuts(_nav: unknown, base: ShortcutOptions[]): ShortcutOptions[] {
  const { isPresenter, currentSlideNo } = useNav()
  return [
    ...base,
    {
      name: 'dd_post_snippets',
      key: 'p',
      fn: () => {
        if (!isPresenter.value) return
        postPage(currentSlideNo.value)
          .then(n => console.info(`[snippets] posted ${n} block(s) from slide ${currentSlideNo.value}`))
          .catch(e => console.error('[snippets]', e))
      },
    },
  ]
}
