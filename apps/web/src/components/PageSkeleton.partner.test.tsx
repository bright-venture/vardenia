// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import DashboardLayout from '../app/(frontend)/[locale]/partner/(dashboard)/layout'
import PartnerLoading from '../app/(frontend)/[locale]/partner/(dashboard)/loading'

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'ar' }))
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () =>
    createTranslator({
      locale: state.locale,
      messages: getMessages(state.locale),
      namespace: 'partner',
    }),
}))
vi.mock('../lib/session', () => ({
  currentOwner: async () => ({ email: 'partner@example.test', businessIds: ['1'] }),
  ownerListings: async () => [{ name: 'Sample venue' }],
}))
vi.mock('../i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('./SignOutButton', () => ({ SignOutButton: () => <button>Sign out</button> }))
vi.mock('./PartnerTabs', () => ({ PartnerTabs: () => <nav aria-label="Partner navigation" /> }))

describe('Partner dashboard loading composition', () => {
  for (const locale of ['en', 'ar'] as const) {
    it(`keeps one main landmark and announces embedded loading in ${locale}`, async () => {
      state.locale = locale
      const messages = getMessages(locale)
      const layout = await DashboardLayout({
        params: Promise.resolve({ locale }),
        children: <PartnerLoading />,
      })
      const root = document.createElement('div')
      root.innerHTML = renderToStaticMarkup(
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Beirut">
          {layout}
        </NextIntlClientProvider>,
      )
      expect(root.querySelectorAll('main')).toHaveLength(1)
      expect(root.querySelector('main main')).toBeNull()
      const busy = root.querySelector('main section[aria-busy="true"]')!
      expect(busy.getAttribute('aria-label')).toBe(messages.common.loading)
      expect(busy.classList.contains('px-6')).toBe(false)
      const status = root.querySelector('[role="status"]')!
      expect(status.textContent).toBe(messages.common.loading)
      expect(status.closest('[aria-hidden="true"], [aria-busy="true"]')).toBeNull()
    })
  }
})
