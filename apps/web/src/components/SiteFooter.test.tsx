// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { getMessages } from '@vardenia/i18n/messages'
import type { HideablePage } from '../lib/hideable-pages'

const hidden = vi.hoisted(() => ({ pages: [] as HideablePage[] }))

vi.mock('next-intl/server', () => ({
  getTranslations: async () => createTranslator({ locale: 'en', messages: getMessages('en') }),
}))
vi.mock('../lib/hidden-pages', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/hideable-pages')>('../lib/hideable-pages')
  return { withoutHidden: actual.withoutHidden, hiddenPages: async () => hidden.pages }
})

const { SiteFooter } = await import('./SiteFooter')

async function footerLinks(pages: HideablePage[]): Promise<string[]> {
  hidden.pages = pages
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={getMessages('en')} timeZone="Asia/Beirut">
      {await SiteFooter()}
    </NextIntlClientProvider>,
  )
  return [...root.querySelectorAll('a')].map((a) => a.textContent ?? '')
}

describe('the site footer and hidden pages', () => {
  it('shows every link when nothing is hidden', async () => {
    expect(await footerLinks([])).toEqual([
      'Vardenia',
      'About',
      'Magazine',
      'Partner with us',
      'Contact',
      'Privacy',
      'Terms',
      'Credits',
      'Partner sign in',
    ])
  })

  /**
   * The Settings list on 11 November 2026: Partner sign in, Partner with us and
   * Contact were hidden and still showed, because the compact footer wrote its
   * small print out by hand and its Partner with us leads to the homepage form.
   */
  it('leaves out what Settings hides, small print and Partner with us included', async () => {
    const links = await footerLinks(['partner-sign-in', 'partner-with-us', 'contact', 'faq'])
    expect(links).not.toContain('Partner sign in')
    expect(links).not.toContain('Partner with us')
    expect(links).not.toContain('Contact')
    expect(links).toEqual(['Vardenia', 'About', 'Magazine', 'Privacy', 'Terms', 'Credits'])
  })

  it('takes Privacy, Terms and Credits out of the small print when hidden', async () => {
    const links = await footerLinks(['privacy', 'terms', 'credits'])
    expect(links).not.toContain('Privacy')
    expect(links).not.toContain('Terms')
    expect(links).not.toContain('Credits')
    expect(links).toContain('Partner sign in')
  })
})
