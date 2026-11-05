// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { ResultsSkeleton } from './ResultsSkeleton'

for (const kind of ['directory', 'editorial'] as const) {
  describe(`${kind} results loading`, () => {
    for (const locale of ['en', 'ar'] as const) {
      it(`announces loading in ${locale} without a nested main landmark`, () => {
        const messages = getMessages(locale)
        const root = document.createElement('div')
        root.innerHTML = renderToStaticMarkup(
          <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Beirut">
            <main>
              <ResultsSkeleton kind={kind} />
            </main>
          </NextIntlClientProvider>,
        )
        expect(root.querySelectorAll('main')).toHaveLength(1)
        const status = root.querySelector('[role="status"]')!
        expect(status.textContent).toBe(messages.common.loading)
        expect(status.closest('[aria-hidden="true"], [aria-busy="true"]')).toBeNull()
        const shapes = root.querySelector('[aria-hidden="true"]')!
        expect(shapes.classList.contains('motion-reduce:animate-none')).toBe(true)
        const grid = root.querySelector(`[data-results-kind="${kind}"]`)!
        expect(grid.children).toHaveLength(6)
        expect(
          grid.classList.contains(kind === 'directory' ? 'grid-cols-2' : 'sm:grid-cols-2'),
        ).toBe(true)
        expect(
          grid.querySelector(
            kind === 'directory' ? '[class*="aspect-[4/5]"]' : '[class*="aspect-[3/2]"]',
          ),
        ).not.toBeNull()
      })
    }
  })
}
