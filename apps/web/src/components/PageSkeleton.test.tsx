// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import { ListingsSkeleton, SearchSkeleton, RecordsSkeleton } from './PageSkeleton'

for (const Component of [ListingsSkeleton, SearchSkeleton, RecordsSkeleton]) {
  describe(Component.name, () => {
    for (const locale of ['en', 'ar'] as const) {
      it(`exposes a localized loading status and busy landmark in ${locale}`, () => {
        const messages = getMessages(locale)
        const html = renderToStaticMarkup(
          <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Beirut">
            <Component />
          </NextIntlClientProvider>,
        )
        const root = document.createElement('div')
        root.innerHTML = html
        const status = root.querySelector('[role="status"]')!
        const main = root.querySelector('main')!
        expect(status.textContent).toBe(messages.common.loading)
        expect(status.closest('[aria-hidden="true"], [aria-busy="true"]')).toBeNull()
        expect(main.getAttribute('aria-busy')).toBe('true')
        expect(main.getAttribute('aria-label')).toBe(messages.common.loading)
        expect(main.hasAttribute('aria-hidden')).toBe(false)
        const shapes = main.firstElementChild!
        expect(shapes.getAttribute('aria-hidden')).toBe('true')
        expect(shapes.classList.contains('motion-reduce:animate-none')).toBe(true)
      })
    }
  })
}
