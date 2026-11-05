// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { Locale } from '@vardenia/i18n'
import { contentPage } from '../lib/pages'
import { ContentPageView } from './ContentPage'

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: Locale }) =>
    createTranslator({ locale, messages: getMessages(locale) }),
}))

for (const locale of ['en', 'ar'] as const) {
  describe(`standing-page composition in ${locale}`, () => {
    for (const slug of [
      'about',
      'contact',
      'faq',
      'add-your-business',
      'partner-with-us',
      'advertise',
    ] as const) {
      it(`preserves the ${slug} sections and offers a next step after reading`, async () => {
        const page = contentPage(slug, locale)!
        const view = await ContentPageView({ page, slug, locale })
        const root = document.createElement('div')
        root.dir = locale === 'ar' ? 'rtl' : 'ltr'
        root.innerHTML = renderToStaticMarkup(
          <NextIntlClientProvider
            locale={locale}
            messages={getMessages(locale)}
            timeZone="Asia/Beirut"
          >
            {view}
          </NextIntlClientProvider>,
        )
        expect(root.querySelectorAll('h1')).toHaveLength(1)
        expect(root.querySelectorAll('.vd-reading-index > a')).toHaveLength(page.sections.length)
        page.sections.forEach((section, i) => {
          expect(root.querySelector(`#story-${i} h2`)?.textContent).toBe(section.heading)
        })
        expect(root.querySelectorAll('.vd-story-next > a')).toHaveLength(2)
        const actions = [...root.querySelectorAll('.vd-story-next a')].map((link) =>
          link.getAttribute('href'),
        )
        expect(
          actions.some((href) =>
            href?.endsWith(['about', 'contact', 'faq'].includes(slug) ? '/directory' : '/contact'),
          ),
        ).toBe(true)
        if (slug === 'faq') {
          expect(root.querySelectorAll('details')).toHaveLength(page.sections.length)
          expect(root.querySelectorAll('details[open]')).toHaveLength(1)
        }
      })
    }
  })
}
